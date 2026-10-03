import time
import math
import hid

# ==================== 漫步者硬件常量 ====================
VENDOR_ID = 0x2D99       # 漫步者 USB VID (11673)
COMMON_BYTE = 0x2F       # Report ID / 标识头 (47)
HEADER_BYTE = 0x55       # 帧起始魔数 (85)

# 常用命令字
CMD_SCREEN_SET = 0xED02      # 屏幕模式与开关设置
CMD_WALLPAPER_SET = 0xED03   # 256x32 点阵/壁纸分包下发
CMD_SCROLL_TEXT = 0x00E8     # 滚动弹幕/文本实时下发
CMD_SCREEN_SAVER = 0xED1E    # 屏保/休眠设置

def build_report(cmd_index, payload=None):
    """
    构造标准漫步者 64 字节 HID 报文
    """
    if payload is None:
        payload = []
    
    device_index = cmd_index // 256
    sub_index = cmd_index & 0xFF
    dev_type = 0x01 if device_index == 1 else 0x00
    
    payload_len = len(payload)
    len_high = (payload_len >> 8) & 0xFF
    len_low = payload_len & 0xFF
    
    # 报文结构: [0x55, dev_type, sub_index, len_high, len_low, ...payload]
    frame = [HEADER_BYTE, dev_type, sub_index, len_high, len_low] + list(payload)
    crc = sum(frame) & 0xFF
    frame.append(crc)
    
    # 填充至 64 字节
    buffer = [COMMON_BYTE] + frame
    if len(buffer) < 64:
        buffer += [0] * (64 - len(buffer))
    return buffer[:64]

class EdifierSpeaker:
    """
    漫步者音响像素屏直接控制驱动类
    """
    def __init__(self):
        self.dev = hid.device()
        self.is_connected = False
        
    def connect(self):
        """扫描并连接漫步者 USB HID 音响设备"""
        print("[*] 正在扫描漫步者音响设备 (VID: 0x2D99)...")
        devices = hid.enumerate(VENDOR_ID)
        if not devices:
            print("[!] 未找到漫步者 USB HID 设备，请确认已连接 USB 数据线！")
            return False
        
        target = devices[0]
        prod_name = target.get('product_string', 'Edifier Speaker')
        print(f"[+] 找到设备: {prod_name} (PID: 0x{target['product_id']:04X}, Path: {target['path']})")
        self.dev.open_path(target['path'])
        self.is_connected = True
        print("[+] 成功打开 HID 通信句柄！")
        return True

    def send_cmd(self, cmd_index, payload=None):
        """发送底层 HID 控制报文"""
        if not self.is_connected:
            raise RuntimeError("设备未连接！")
        buf = build_report(cmd_index, payload)
        self.dev.write(buf)
        hex_str = " ".join(f"{b:02X}" for b in buf[:16])
        print(f"  -> TX [0x{cmd_index:04X}]: {hex_str} ... ({len(buf)} 字节)")

    def set_screen_power(self, power_on=True):
        """控制像素屏电源开关"""
        print(f"[*] 设置屏幕电源: {'开启' if power_on else '关闭'}")
        val = 0 if power_on else 1
        self.send_cmd(CMD_SCREEN_SET, [1, 0, val])

    def set_mode(self, mode_group=1):
        """
        切换显示模式:
        0: 纯色色彩 (Color)
        1: 时钟场景 (Clock Scene)
        2: 像素空间 (Pixel Space)
        3: 音乐律动 (Music Spectrum)
        5: 时间工具/番茄钟 (Time Tool)
        8: 新闻动态 (News)
        9: 天气看板 (Weather)
        """
        print(f"[*] 切换显示模式为: {mode_group}")
        self.send_cmd(CMD_SCREEN_SET, [mode_group, 0, 0, 0, 0])

    def send_scroll_text(self, text, source_id=1):
        """
        下发实时水平滚动弹幕/文本 (CM_E8)
        """
        print(f"[*] 下发滚动文本: '{text}'")
        text_bytes = list(text.encode('utf-8'))[:255]
        chunk_size = 48
        total_chunks = math.ceil(len(text_bytes) / chunk_size)
        
        for i in range(total_chunks):
            chunk = text_bytes[i*chunk_size : (i+1)*chunk_size]
            payload = [source_id, len(text_bytes)] + chunk
            self.send_cmd(CMD_SCROLL_TEXT, payload)
            time.sleep(0.025) # 25ms 间隔
        print("[+] 滚动文本下发完成！")

    def send_pixel_matrix(self, matrix):
        """
        下发 256x32 点阵图像 (CM_ED03)
        :param matrix: 二维列表 32行 x 256列 (matrix[row][col] 为 0 或 1)
        """
        print("[*] 正在打包 256x32 点阵 (LSB 垂直分组编码)...")
        payload = bytearray(1024)
        for r in range(32):
            for c in range(256):
                if matrix[r][c]:
                    group = r // 8
                    bit = r % 8
                    payload[group * 256 + c] |= (1 << bit)
        
        # 构造 16 字节 BIN 文件头
        header = bytearray(16)
        now_str = f"{int(time.time()):016d}"
        for i in range(8):
            header[i] = int(now_str[i*2:(i+1)*2])
        total_len = 16 + 1024 # 1040 字节
        header[8:12] = total_len.to_bytes(4, 'big')
        header[12] = 0x5A
        header[13] = 0xA5
        header[14] = 0x01 # 静态帧
        header[15] = 0x00
        
        full_bin = header + payload
        chunk_size = 52
        total_packets = math.ceil(len(full_bin) / chunk_size)
        combo_index = 0
        
        print(f"[*] 分 {total_packets} 包下发点阵数据 (CM_ED03)...")
        for i in range(total_packets):
            chunk = list(full_bin[i*chunk_size : (i+1)*chunk_size])
            wrapped = [combo_index, total_packets, i] + chunk
            self.send_cmd(CMD_WALLPAPER_SET, wrapped)
            time.sleep(0.015)
        print("[+] 点阵画面刷屏完成！")

    def close(self):
        """释放 HID 连接"""
        if self.is_connected:
            self.dev.close()
            self.is_connected = False
            print("[+] 已断开与音响的连接。")

if __name__ == "__main__":
    speaker = EdifierSpeaker()
    if speaker.connect():
        try:
            # 1. 发送滚动弹幕测试
            speaker.send_scroll_text("🎵 漫步者音响像素屏控制测试 ~ Hello from Python!")
            time.sleep(2)
            
            # 2. 绘制简单点阵测试 (正弦波 + 边框)
            demo_matrix = [[0]*256 for _ in range(32)]
            for col in range(256):
                # 顶部与底部边框
                demo_matrix[0][col] = 1
                demo_matrix[31][col] = 1
                # 正弦波
                y = int(16 + 12 * math.sin(col * 0.1))
                if 0 <= y < 32:
                    demo_matrix[y][col] = 1
            
            speaker.send_pixel_matrix(demo_matrix)
        finally:
            speaker.close()
