#[tauri::command]
fn read_vault_file(dir: String) -> Result<String, String> {
  use std::fs;
  use std::path::PathBuf;
  let p = PathBuf::from(&dir).join("household-finance-data.json");
  match fs::read_to_string(&p) {
    Ok(s) => Ok(s),
    Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
    Err(e) => Err(e.to_string()),
  }
}

#[tauri::command]
fn write_vault_file(dir: String, contents: String) -> Result<(), String> {
  use std::fs;
  use std::path::PathBuf;
  let p = PathBuf::from(&dir).join("household-finance-data.json");
  fs::write(&p, contents).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![read_vault_file, write_vault_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
