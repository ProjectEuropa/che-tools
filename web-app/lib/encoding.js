/**
 * Encoding.js - Shift-JIS / UTF-8 変換ユーティリティ
 * 簡易版: よく使用される文字のみ対応
 */

const Encoding = {
    // Shift-JIS to Unicode 変換テーブル（基本的な日本語文字）
    SJIS_TO_UNICODE: null,
    UNICODE_TO_SJIS: null,

    /**
     * Shift-JIS バイト配列を UTF-8 文字列に変換
     * @param {Uint8Array} bytes - Shift-JIS エンコードされたバイト配列
     * @returns {string} UTF-8 文字列
     */
    toUTF8: function (bytes) {
        let result = '';
        let i = 0;

        while (i < bytes.length) {
            const byte1 = bytes[i];

            // ヌル文字で終了
            if (byte1 === 0) break;

            // ASCII (0x00-0x7F)
            if (byte1 <= 0x7F) {
                result += String.fromCharCode(byte1);
                i++;
                continue;
            }

            // 半角カナ (0xA1-0xDF)
            if (byte1 >= 0xA1 && byte1 <= 0xDF) {
                // 半角カタカナをUnicodeに変換
                result += String.fromCharCode(0xFF61 + (byte1 - 0xA1));
                i++;
                continue;
            }

            // 2バイト文字
            if (i + 1 >= bytes.length) {
                i++;
                continue;
            }

            const byte2 = bytes[i + 1];
            const sjisCode = (byte1 << 8) | byte2;
            const unicode = this.sjisToUnicode(sjisCode);

            if (unicode) {
                result += String.fromCharCode(unicode);
            } else {
                // 未知の文字は?に置換
                result += '?';
            }
            i += 2;
        }

        return result;
    },

    /**
     * UTF-8 文字列を Shift-JIS バイト配列に変換
     * @param {string} str - UTF-8 文字列
     * @returns {Uint8Array} Shift-JIS エンコードされたバイト配列
     */
    toSJIS: function (str) {
        const bytes = [];

        for (let i = 0; i < str.length; i++) {
            const charCode = str.charCodeAt(i);

            // ASCII
            if (charCode <= 0x7F) {
                bytes.push(charCode);
                continue;
            }

            // 半角カタカナ (U+FF61 - U+FF9F)
            if (charCode >= 0xFF61 && charCode <= 0xFF9F) {
                bytes.push(0xA1 + (charCode - 0xFF61));
                continue;
            }

            // 2バイト文字
            const sjis = this.unicodeToSjis(charCode);
            if (sjis) {
                bytes.push((sjis >> 8) & 0xFF);
                bytes.push(sjis & 0xFF);
            } else {
                // 未知の文字は?に置換
                bytes.push(0x3F);
            }
        }

        return new Uint8Array(bytes);
    },

    /**
     * Shift-JISコードをUnicodeに変換
     */
    sjisToUnicode: function (sjis) {
        // 基本的な変換ロジック
        const hi = (sjis >> 8) & 0xFF;
        const lo = sjis & 0xFF;

        // JIS X 0208 変換
        let row, cell;

        if (hi >= 0x81 && hi <= 0x9F) {
            row = (hi - 0x81) * 2 + 1;
        } else if (hi >= 0xE0 && hi <= 0xEF) {
            row = (hi - 0xE0) * 2 + 63;
        } else {
            return null;
        }

        if (lo >= 0x40 && lo <= 0x7E) {
            cell = lo - 0x40 + 1;
        } else if (lo >= 0x80 && lo <= 0x9E) {
            cell = lo - 0x80 + 64;
        } else if (lo >= 0x9F && lo <= 0xFC) {
            cell = lo - 0x9F + 1;
            row++;
        } else {
            return null;
        }

        // JIS X 0208 -> Unicode 変換テーブルを使用
        return this.jisToUnicode(row, cell);
    },

    /**
     * UnicodeをShift-JISに変換
     */
    unicodeToSjis: function (unicode) {
        // 基本的な全角文字の変換
        // ひらがな (U+3040-U+309F)
        if (unicode >= 0x3040 && unicode <= 0x309F) {
            return this.hiraganaToSjis(unicode);
        }
        // カタカナ (U+30A0-U+30FF)
        if (unicode >= 0x30A0 && unicode <= 0x30FF) {
            return this.katakanaToSjis(unicode);
        }
        // 全角英数 (U+FF01-U+FF5E)
        if (unicode >= 0xFF01 && unicode <= 0xFF5E) {
            return this.fullwidthToSjis(unicode);
        }

        return this.unicodeToSjisTable(unicode);
    },

    // ひらがな変換
    hiraganaToSjis: function (unicode) {
        const offset = unicode - 0x3040;
        // ひらがなはJIS X 0208の4区に配置
        const row = 4;
        const cell = offset + 1;
        return this.jisToSjis(row, cell);
    },

    // カタカナ変換  
    katakanaToSjis: function (unicode) {
        const offset = unicode - 0x30A0;
        // カタカナはJIS X 0208の5区に配置
        const row = 5;
        const cell = offset + 1;
        return this.jisToSjis(row, cell);
    },

    // 全角英数変換
    fullwidthToSjis: function (unicode) {
        const offset = unicode - 0xFF01;
        // 全角英数はJIS X 0208の3区に配置
        const row = 3;
        const cell = offset + 1;
        return this.jisToSjis(row, cell);
    },

    // JIS区点をShift-JISに変換
    jisToSjis: function (row, cell) {
        let hi, lo;

        if (row <= 62) {
            hi = Math.floor((row + 1) / 2) + 0x80;
        } else {
            hi = Math.floor((row - 63) / 2) + 0xE0;
        }

        if (row % 2 === 1) {
            if (cell <= 63) {
                lo = cell + 0x3F;
            } else {
                lo = cell + 0x40;
            }
        } else {
            lo = cell + 0x9E;
        }

        return (hi << 8) | lo;
    },

    // JIS区点からUnicodeへの変換
    jisToUnicode: function (row, cell) {
        // 簡易変換テーブル（よく使う文字のみ）
        // 実際のアプリケーションでは完全なテーブルが必要

        // ひらがな (4区)
        if (row === 4 && cell >= 1 && cell <= 83) {
            return 0x3040 + cell - 1;
        }

        // カタカナ (5区)
        if (row === 5 && cell >= 1 && cell <= 86) {
            return 0x30A0 + cell - 1;
        }

        // 全角英数記号 (3区)
        if (row === 3 && cell >= 1 && cell <= 94) {
            return 0xFF01 + cell - 1;
        }

        // 漢字 (16区以降) - 完全なテーブルが必要
        // TextDecoderを使用してフォールバック
        return null;
    },

    // Unicodeから変換テーブル検索
    unicodeToSjisTable: function (unicode) {
        // 基本的な変換のみ
        // 完全な変換にはTextEncoderを使用
        return null;
    }
};

// TextDecoder/TextEncoder が使用可能な場合はそれを優先
if (typeof TextDecoder !== 'undefined') {
    const sjisDecoder = new TextDecoder('shift-jis');

    Encoding.toUTF8 = function (bytes) {
        // ヌル終端を処理
        let endIndex = bytes.indexOf(0);
        if (endIndex === -1) endIndex = bytes.length;

        const slice = bytes.slice(0, endIndex);
        try {
            return sjisDecoder.decode(slice);
        } catch (e) {
            console.warn('Shift-JIS decode error:', e);
            return '';
        }
    };
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Encoding;
}
