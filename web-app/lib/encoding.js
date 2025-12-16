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

// TextEncoder for Shift-JIS using encoding API polyfill approach
// ブラウザのTextEncoderはUTF-8のみなので、変換テーブルを使用
(function () {
    // 漢字変換テーブル（JIS第一・第二水準の主要な文字）
    // 完全なテーブルは大きすぎるため、動的生成を試みる

    // Shift-JISエンコーディングをサポートする方法:
    // Blobを使ってShift-JISにエンコード
    Encoding.toSJISAsync = async function (str) {
        // この方法はNode.jsやモダンブラウザで動作
        const blob = new Blob([str], { type: 'text/plain;charset=shift_jis' });
        const buffer = await blob.arrayBuffer();
        return new Uint8Array(buffer);
    };

    // 同期的なShift-JIS変換（Unicode -> Shift-JIS テーブル使用）
    // 主要な漢字を含む変換テーブル
    const UNICODE_TO_SJIS_MAP = new Map();

    // 基本的な漢字の変換テーブルを構築
    // JIS第一水準漢字（16区〜47区）の一部
    const commonKanji = {
        // よく使う漢字
        '新': 0x9056, '規': 0x8B4B, '大': 0x91E5, '会': 0x89EF,
        '小': 0x8FAC, '中': 0x9286, '高': 0x8D82, '低': 0x92E1,
        '上': 0x8FE3, '下': 0x89BA, '左': 0x8DB6, '右': 0x8945,
        '前': 0x914F, '後': 0x8CE3, '内': 0x93E0, '外': 0x8A4F,
        '開': 0x8A4A, '閉': 0x95C2, '始': 0x8E6E, '終': 0x8F49,
        '勝': 0x8F9F, '敗': 0x9473, '引': 0x88F8, '分': 0x95AA,
        '戦': 0x90ED, '対': 0x91CE, '試': 0x8E8E, '合': 0x8D87,
        '点': 0x935F, '得': 0x93BE, '失': 0x8EB8, '順': 0x8F87,
        '位': 0x88CA, '番': 0x94D4, '号': 0x8D86, '回': 0x89F1,
        '目': 0x96DA, '日': 0x93FA, '月': 0x8C8E, '年': 0x944E,
        '時': 0x8E9E, '間': 0x8AD4, '場': 0x8FEA, '所': 0x8F8A,
        '名': 0x96BC, '人': 0x906C, '者': 0x8ED2, '員': 0x88F5,
        '本': 0x967B, '数': 0x9094, '全': 0x9153, '部': 0x9594,
        '正': 0x90B3, '逆': 0x8B74, '表': 0x955C, '裏': 0x97A0,
        '結': 0x8C8B, '果': 0x89CA, '集': 0x8F57, '計': 0x8C76,
        '登': 0x936F, '録': 0x985E, '削': 0x8DED, '除': 0x8F9C,
        '追': 0x92C7, '加': 0x89C1, '変': 0x95CF, '更': 0x8D58,
        '保': 0x95DB, '存': 0x91B6, '読': 0x93C7, '込': 0x8D9E,
        '出': 0x8F6F, '力': 0x97CD, '入': 0x93FC, '編': 0x95D2,
        '成': 0x90AC, '作': 0x8DEC, '動': 0x93AE, '止': 0x8E7E,
        '使': 0x8E67, '用': 0x9770, '選': 0x9149, '択': 0x91F0,
        '決': 0x8C88, '定': 0x92E8, '確': 0x8A6D, '認': 0x9446,
        '送': 0x9197, '信': 0x904D, '受': 0x8EF3, '取': 0x8EE6,
        '最': 0x8DC5, '初': 0x8F89, '終': 0x8F49, '了': 0x97B9,
        '完': 0x8AAE, '成': 0x90AC, '功': 0x8CF7, '失': 0x8EB8,
        // カルネージハート関連
        '機': 0x8B40, '体': 0x91CC, '兵': 0x95BA, '器': 0x8AED,
        '武': 0x9590, '装': 0x9195, '型': 0x8C5E, '式': 0x8EB0,
        '能': 0x945C, '性': 0x90AB, '攻': 0x8D55, '撃': 0x8C82,
        '防': 0x9668, '御': 0x8CE4, '速': 0x91AC, '度': 0x9378,
        '量': 0x97CA, '重': 0x8F64, '軽': 0x8C79, '強': 0x8BAD,
        '弱': 0x8EE3, '硬': 0x8D64, '柔': 0x8F5F, '鋭': 0x8973,
        '鈍': 0x9383, '熱': 0x944D, '冷': 0x97E2, '電': 0x9364,
        '磁': 0x8EA5, '光': 0x8CF5, '音': 0x89B9, '波': 0x9467,
        '砲': 0x9643, '弾': 0x9265, '銃': 0x8F65, '剣': 0x8C95,
        '刃': 0x906E, '盾': 0x8F82, '甲': 0x8D62, '殻': 0x8A6B
    };

    for (const [char, sjis] of Object.entries(commonKanji)) {
        UNICODE_TO_SJIS_MAP.set(char.charCodeAt(0), sjis);
    }

    // toSJIS関数を拡張
    Encoding.toSJIS = function (str) {
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

            // 変換テーブルを検索
            if (UNICODE_TO_SJIS_MAP.has(charCode)) {
                const sjis = UNICODE_TO_SJIS_MAP.get(charCode);
                bytes.push((sjis >> 8) & 0xFF);
                bytes.push(sjis & 0xFF);
                continue;
            }

            // ひらがな (U+3040-U+309F)
            if (charCode >= 0x3041 && charCode <= 0x3093) {
                const sjis = Encoding.hiraganaToSjis(charCode);
                if (sjis) {
                    bytes.push((sjis >> 8) & 0xFF);
                    bytes.push(sjis & 0xFF);
                    continue;
                }
            }

            // カタカナ (U+30A0-U+30FF)
            if (charCode >= 0x30A1 && charCode <= 0x30F6) {
                const sjis = Encoding.katakanaToSjis(charCode);
                if (sjis) {
                    bytes.push((sjis >> 8) & 0xFF);
                    bytes.push(sjis & 0xFF);
                    continue;
                }
            }

            // 全角英数 (U+FF01-U+FF5E)
            if (charCode >= 0xFF01 && charCode <= 0xFF5E) {
                const sjis = Encoding.fullwidthToSjis(charCode);
                if (sjis) {
                    bytes.push((sjis >> 8) & 0xFF);
                    bytes.push(sjis & 0xFF);
                    continue;
                }
            }

            // 未知の文字は?に置換
            // 0x00にすると文字列がそこで終了してしまうため、0x3F(?)を使用
            bytes.push(0x3F);
        }

        return new Uint8Array(bytes);
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Encoding;
}
