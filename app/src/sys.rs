#[cfg(windows)]
pub fn attach_console_if_present() -> bool {
    use std::fs::OpenOptions;
    use std::os::windows::io::AsRawHandle;
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::System::Console::{
        AttachConsole, GetConsoleWindow, SetStdHandle, ATTACH_PARENT_PROCESS, STD_ERROR_HANDLE,
        STD_OUTPUT_HANDLE,
    };
    unsafe {
        if !GetConsoleWindow().0.is_null() {
            return true;
        }
        if AttachConsole(ATTACH_PARENT_PROCESS).is_err() {
            return false;
        }
        if let Ok(conout) = OpenOptions::new().read(true).write(true).open("CONOUT$") {
            let h = HANDLE(conout.as_raw_handle() as _);
            let _ = SetStdHandle(STD_OUTPUT_HANDLE, h);
            let _ = SetStdHandle(STD_ERROR_HANDLE, h);
            std::mem::forget(conout); // keep the console handle valid for the whole run
        }
        true
    }
}

#[cfg(not(windows))]
pub fn attach_console_if_present() -> bool {
    use std::io::IsTerminal;
    std::io::stderr().is_terminal()
}
