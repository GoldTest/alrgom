use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use std::collections::HashMap;
use traceable_conv_rng::TraceableRng;

fn main() {
    let host = "127.0.0.1";
    let port = 8080;
    let addr = format!("{}:{}", host, port);

    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("Failed to bind to {}: {}", addr, e);
            return;
        }
    };

    println!("===========================================================");
    println!(" Traceable Conv/Pooling RNG Server is running!");
    println!(" Open Web UI in browser: http://{}", addr);
    println!("===========================================================");

    for stream in listener.incoming() {
        match stream {
            Ok(mut stream) => {
                thread::spawn(move || {
                    let mut buffer = [0u8; 4096];
                    let bytes_read = match stream.read(&mut buffer) {
                        Ok(n) => n,
                        Err(_) => return,
                    };
                    if bytes_read == 0 {
                        return;
                    }

                    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
                    let first_line = request.lines().next().unwrap_or("");
                    let parts: Vec<&str> = first_line.split_whitespace().collect();

                    if parts.len() < 2 {
                        return;
                    }

                    let path_and_query = parts[1];
                    let (path, query) = match path_and_query.split_once('?') {
                        Some((p, q)) => (p, q),
                        None => (path_and_query, ""),
                    };

                    let params = parse_query(query);

                    if path == "/" || path == "/index.html" {
                        let html = get_index_html();
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                            html.len(),
                            html
                        );
                        let _ = stream.write_all(response.as_bytes());
                    } else if path == "/api/generate" {
                        let seed_str = params.get("seed").cloned().unwrap_or_else(|| "12345678".to_string());
                        let size_str = params.get("size").cloned().unwrap_or_else(|| "16".to_string());

                        let seed: u64 = seed_str.parse().unwrap_or(12345678);
                        let size: usize = size_str.parse().unwrap_or(16);

                        let rng = TraceableRng::new(seed, size);
                        let json = rng.get_layers_json();

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                            json.len(),
                            json
                        );
                        let _ = stream.write_all(response.as_bytes());
                    } else if path == "/api/trace" {
                        let seed_str = params.get("seed").cloned().unwrap_or_else(|| "12345678".to_string());
                        let size_str = params.get("size").cloned().unwrap_or_else(|| "16".to_string());
                        let layer_str = params.get("layer").cloned().unwrap_or_else(|| "3".to_string());
                        let row_str = params.get("row").cloned().unwrap_or_else(|| "0".to_string());
                        let col_str = params.get("col").cloned().unwrap_or_else(|| "0".to_string());

                        let seed: u64 = seed_str.parse().unwrap_or(12345678);
                        let size: usize = size_str.parse().unwrap_or(16);
                        let layer: usize = layer_str.parse().unwrap_or(3);
                        let row: usize = row_str.parse().unwrap_or(0);
                        let col: usize = col_str.parse().unwrap_or(0);

                        let rng = TraceableRng::new(seed, size);
                        let json = rng.get_trace_tree_json(layer, row, col);

                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: *\r\n\r\n{}",
                            json.len(),
                            json
                        );
                        let _ = stream.write_all(response.as_bytes());
                    } else {
                        let msg = "404 Not Found";
                        let response = format!(
                            "HTTP/1.1 404 NOT FOUND\r\nContent-Type: text/plain\r\nContent-Length: {}\r\n\r\n{}",
                            msg.len(),
                            msg
                        );
                        let _ = stream.write_all(response.as_bytes());
                    }
                });
            }
            Err(e) => {
                eprintln!("Connection failed: {}", e);
            }
        }
    }
}

fn parse_query(query: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();
    if query.is_empty() {
        return map;
    }
    for pair in query.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            map.insert(k.to_string(), v.to_string());
        }
    }
    map
}

fn get_index_html() -> &'static str {
    include_str!("../web/index.html")
}
