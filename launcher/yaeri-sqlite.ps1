#requires -Version 5.1
# Windows 10/11 ships winsqlite3.dll; no Python, Node or external server.
# SQLite is authoritative for JSON snapshots; JSON files remain readable backups.
if (-not ('YaeriNativeSqlite' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class YaeriNativeSqlite {
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_open(byte[] filename, out IntPtr db);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_close(IntPtr db);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_exec(IntPtr db, byte[] sql, IntPtr callback, IntPtr arg, out IntPtr error);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern void sqlite3_free(IntPtr ptr);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_prepare_v2(IntPtr db, byte[] sql, int length, out IntPtr stmt, IntPtr tail);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_step(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern IntPtr sqlite3_column_blob(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_column_bytes(IntPtr stmt, int col);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern int sqlite3_finalize(IntPtr stmt);
    [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
    private static extern IntPtr sqlite3_errmsg(IntPtr db);

    private static byte[] Utf8(string value) {
        byte[] raw = Encoding.UTF8.GetBytes(value);
        byte[] terminated = new byte[raw.Length + 1];
        Buffer.BlockCopy(raw, 0, terminated, 0, raw.Length);
        return terminated;
    }
    private static string Quote(string value) { return "'" + value.Replace("'", "''") + "'"; }
    private static void Check(IntPtr db, int result) {
        if (result != 0) throw new InvalidOperationException("SQLite error " + result + ": " + Marshal.PtrToStringAnsi(sqlite3_errmsg(db)));
    }
    private static void Exec(IntPtr db, string sql) {
        IntPtr error;
        int rc = sqlite3_exec(db, Utf8(sql), IntPtr.Zero, IntPtr.Zero, out error);
        if (error != IntPtr.Zero) sqlite3_free(error);
        Check(db, rc);
    }
    private static IntPtr Open(string path) {
        IntPtr db;
        int rc = sqlite3_open(Utf8(path), out db);
        if (rc != 0) {
            if (db != IntPtr.Zero) sqlite3_close(db);
            throw new InvalidOperationException("Cannot open SQLite: " + rc);
        }
        try {
            Exec(db, "PRAGMA busy_timeout=15000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS json_snapshots (name TEXT PRIMARY KEY, content BLOB NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);");
            return db;
        } catch { sqlite3_close(db); throw; }
    }
    public static byte[] Read(string path, string name) {
        IntPtr db = Open(path);
        try {
            IntPtr stmt;
            byte[] query = Utf8("SELECT content FROM json_snapshots WHERE name=" + Quote(name));
            Check(db, sqlite3_prepare_v2(db, query, -1, out stmt, IntPtr.Zero));
            try {
                if (sqlite3_step(stmt) != 100) return null;
                int count = sqlite3_column_bytes(stmt, 0);
                byte[] data = new byte[count];
                if (count > 0) Marshal.Copy(sqlite3_column_blob(stmt, 0), data, 0, count);
                return data;
            } finally { sqlite3_finalize(stmt); }
        } finally { sqlite3_close(db); }
    }
    public static void Write(string path, string name, byte[] content) {
        IntPtr db = Open(path);
        try {
            string hex = BitConverter.ToString(content).Replace("-", "");
            Exec(db, "INSERT OR REPLACE INTO json_snapshots(name,content,updated_at) VALUES(" +
                Quote(name) + ",X'" + hex + "',CURRENT_TIMESTAMP)");
        } finally { sqlite3_close(db); }
    }
}
'@
}

function Test-YSqliteDataPath([string]$Path) {
    # Only direct data/*.json snapshots; never put API credentials into SQLite.
    $parent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetDirectoryName($Path)).TrimEnd('\','/')
    $data = [System.IO.Path]::GetFullPath($script:DataDir).TrimEnd('\','/')
    return ($parent -eq $data -and [System.IO.Path]::GetExtension($Path) -eq '.json')
}
function Get-YSqlitePath { return (Join-Path $script:DataDir 'yaeri.sqlite3') }
function Read-YSqliteSnapshot([string]$Path) {
    $bytes = [YaeriNativeSqlite]::Read((Get-YSqlitePath), [System.IO.Path]::GetFileName($Path))
    if ($null -eq $bytes) { return $null }
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}
function Write-YSqliteSnapshot([string]$Path, [string]$Text) {
    [YaeriNativeSqlite]::Write((Get-YSqlitePath), [System.IO.Path]::GetFileName($Path), [System.Text.Encoding]::UTF8.GetBytes($Text))
}
