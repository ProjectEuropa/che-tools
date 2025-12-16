# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Carnage Heart EXA（PSP用ゲーム）のCHEファイルを操作するWebアプリケーション。既存のWindows用ツール（CHX2_3、CarTa、CarVi、ECMX）の機能をブラウザで再現する。

## 開発環境

- 静的Webアプリケーション（ビルド不要）
- ローカルサーバーで実行: `python3 -m http.server 8000` → http://localhost:8000/web-app/
- file://プロトコルでも動作可能

## アーキテクチャ

### モジュール構成 (web-app/js/)

| ファイル | 役割 | 相当する既存ツール |
|---------|------|-------------------|
| `che-parser.js` | CHEファイルのパース・生成（CETD/CEMD形式） | - |
| `team-editor.js` | チーム選択・並べ替え・ファイル保存 | CHX2_3 |
| `table-viewer.js` | 勝敗表の表示・編集 | CarTa/CarVi |
| `result-calc.js` | 結果集計・順位表生成 | ECMX |
| `app.js` | アプリ初期化・タブ切り替え・ファイル読み込み | - |

### データフロー

1. App.handleFiles() → CHEParser.parse() でファイル読み込み
2. TeamEditor.addTeamsFromFile() で利用可能チームに追加
3. TableViewer.setMatchData() で勝敗表データを設定
4. ResultCalc.calculate() でTableViewerからデータ取得し集計

### CHEファイル形式

2種類のファイル形式を扱う:

- **CETD (team.CHE)**: 単一チームデータ（24,512バイト）、OKEプログラム含む
- **CEMD (match.CHE)**: マッチデータ（266,232バイト固定）、最大16チーム

詳細な構造は `MATCH_CHE_FORMAT.md` を参照。

### OKEプログラム変換

team.CHE → match.CHE変換時、OKEプログラムは2ブロックにまたがって格納:
- Block N +0x1C94: プログラム先頭556バイト
- Block N+1 +0x0000: プログラム残り7316バイト

各チームに6ブロック割り当て（3 OKE × 2ブロック）。

### 重要な制約

- **テンプレート依存**: match.CHE生成時は `web-app/template.CHE` が必須
- **文字コード**: チーム名・オーナー名はShift-JIS。`lib/encoding.js` で変換
- **バイナリ操作**: リトルエンディアン

## コード規約

- グローバルオブジェクト: `CHEParser`, `TeamEditor`, `TableViewer`, `ResultCalc`, `App`, `Encoding`
- 各モジュールは `window` に公開し、他モジュールから参照可能

## MCP設定

バイナリ解析用にradare2とGhidra MCPサーバーを利用可能:

```json
{
  "mcpServers": {
    "radare2": {
      "command": "r2mcp"
    },
    "ghidra": {
      "command": "python",
      "args": [
        "/Users/masato/Downloads/GhidraMCP/bridge_mcp_ghidra.py/bridge_mcp_ghidra.py",
        "--ghidra-server",
        "http://127.0.0.1:8080/"
      ]
    }
  }
}
```
