/**
 * CHE Parser - CHEファイル（CETD/CEMD形式）パーサー
 */

const CHEParser = {
    // ファイルタイプ定数
    TYPE_TEAM: 'CETD',
    TYPE_MATCH: 'CEMD',

    // レコードサイズ
    TEAM_RECORD_SIZE: 880,

    /**
     * CHEファイルをパースする
     * @param {ArrayBuffer} buffer - ファイルデータ
     * @returns {Object} パース結果
     */
    parse: function (buffer) {
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        // マジックナンバー確認 (4バイト)
        const magic = this.readString(bytes, 0, 4);

        if (magic === this.TYPE_TEAM) {
            return this.parseTeamFile(buffer);
        } else if (magic === this.TYPE_MATCH) {
            return this.parseMatchFile(buffer);
        } else {
            throw new Error('Unknown CHE file format: ' + magic);
        }
    },

    /**
     * チームファイル（CETD）をパース
     */
    parseTeamFile: function (buffer) {
        const bytes = new Uint8Array(buffer);
        const teams = [];

        // ヘッダー情報 (0x00-0x04: "CETD")
        const header = {
            magic: this.readString(bytes, 0, 4),
            version: this.readUint32(bytes, 4)
        };

        // team.CHEはファイル全体で1チームのデータ
        // カラーパレット: 0x240 (16色 x 4バイト = 64バイト)
        // チーム名: 0x280 (24バイト)
        // オーナー名: 0x298 (24バイト)

        const colorOffset = 0x240;
        const colors = [];
        for (let i = 0; i < 16; i++) {
            const r = bytes[colorOffset + i * 4];
            const g = bytes[colorOffset + i * 4 + 1];
            const b = bytes[colorOffset + i * 4 + 2];
            const a = bytes[colorOffset + i * 4 + 3];
            colors.push({ r, g, b, a });
        }

        const nameOffset = 0x280;
        const name = this.readSJISString(bytes, nameOffset, 24);

        const ownerOffset = 0x298;
        // オーナー名は先頭に0x00が入ることがあるためスキップ処理付きで読む
        const owner = this.readSJISString(bytes, ownerOffset, 24);

        if (name && name.trim()) {
            teams.push({
                name: name,
                owner: owner || '',
                colors: colors,
                primaryColor: colors[1] || colors[0] || { r: 128, g: 128, b: 128, a: 255 },
                sourceIndex: 0
            });
        }

        return {
            type: 'team',
            header: header,
            teams: teams,
            raw: buffer
        };
    },

    /**
     * マッチファイル（CEMD）をパース
     */
    parseMatchFile: function (buffer) {
        console.log('Parsing match file, size:', buffer.byteLength);
        const bytes = new Uint8Array(buffer);
        const view = new DataView(buffer);

        // ヘッダー情報
        // チーム数は0x34(4byte), マッチ数は0x38(4byte)から取得
        // 0x30は初期化パターン(0xCDCDCDCD)
        const header = {
            magic: this.readString(bytes, 0, 4),
            headerSize: this.readUint16(bytes, 4),
            version: this.readString(bytes, 8, 8).replace(/\0/g, ''),
            tournamentName: Encoding.toUTF8(bytes.slice(0x10, 0x30)),
            teamCount: this.readUint32(bytes, 0x34),
            matchCount: this.readUint32(bytes, 0x38)
        };
        console.log('Match Header:', header);
        console.log('Raw Tournament Name Bytes:', bytes.slice(0x10, 0x30));
        console.log('Parsed Tournament Name:', header.tournamentName);

        // チーム情報とマッチ結果を抽出
        const teams = [];

        // 解析に基づく固定パラメータ
        const SLOT_SIZE = 832;           // 0x340 bytes
        const SLOT_START_OFFSET = 0x488; // Slot 1からデータ開始

        // チーム抽出
        console.log(`Extracting ${header.teamCount} teams from offset ${SLOT_START_OFFSET}`);
        for (let i = 0; i < header.teamCount; i++) {
            const offset = SLOT_START_OFFSET + (i * SLOT_SIZE);
            if (offset + SLOT_SIZE > buffer.byteLength) {
                console.warn(`Buffer overflow at team ${i}, offset ${offset}`);
                break;
            }

            const team = this.parseMatchTeamRecord(bytes, offset);

            if (team) {
                // match.CHE由来のチームにもrawBufferを保存（再保存時のデータ劣化防止）
                // スロット全体をrawBufferとして保存
                team.rawBuffer = buffer.slice(offset, offset + SLOT_SIZE);
                team.isMatchDerived = true; // match.CHE由来であることを示すフラグ
                teams.push(team);
            }
        }
        console.log('Parsed teams:', teams.length);

        // 結果データを抽出
        const results = this.extractMatchResults(bytes, header.teamCount);

        return {
            type: 'match',
            header: header,
            teams: teams,
            results: results,
            raw: buffer
        };
    },

    /**
     * チームレコードをパース（CETDフォーマット）
     */
    parseTeamRecord: function (bytes, offset) {
        // オフセット0x374にチーム名がある
        const nameOffset = offset + 0x374;

        if (nameOffset + 32 > bytes.length) return null;

        const name = this.readSJISString(bytes, nameOffset, 24);
        if (!name) return null;

        // オーナー名
        const ownerOffset = nameOffset + 24;
        const owner = this.readSJISString(bytes, ownerOffset, 24);

        // カラー情報 (オフセット0x240)
        const colorOffset = offset + 0x240;
        const colors = [];
        for (let i = 0; i < 16; i++) {
            const r = bytes[colorOffset + i * 4];
            const g = bytes[colorOffset + i * 4 + 1];
            const b = bytes[colorOffset + i * 4 + 2];
            const a = bytes[colorOffset + i * 4 + 3];
            colors.push({ r, g, b, a });
        }

        return {
            name: name,
            owner: owner || '',
            colors: colors,
            primaryColor: colors[0] || { r: 128, g: 128, b: 128, a: 255 }
        };
    },

    /**
     * マッチファイル内のチームレコードをパース
     */
    parseMatchTeamRecord: function (bytes, offset) {
        // カラーパレット (Offset 0x18)
        // match.CHEの領域(0x18-0x56 = 62bytes)には16色(64bytes)入らないため15色まで
        const colorOffset = offset + 0x18;
        const colors = [];
        for (let i = 0; i < 15; i++) {
            const r = bytes[colorOffset + i * 4];
            const g = bytes[colorOffset + i * 4 + 1];
            const b = bytes[colorOffset + i * 4 + 2];
            const a = bytes[colorOffset + i * 4 + 3];
            colors.push({ r, g, b, a });
        }
        // 16色目はダミーを追加
        colors.push({ r: 0, g: 0, b: 0, a: 0 });

        // チーム名 (Offset 0x54へ変更: パレット15色(60byte)直後から始まる可能性対応)
        // 元々0x56としていたが、0x54からデータが始まっているファイルがある模様
        // readSJISStringは00をスキップするので、0x56開始のファイルでも問題ないはず
        const nameOffset = offset + 0x54;
        const name = this.readSJISString(bytes, nameOffset, 26); // 長さも+2しておく

        // デバッグ: 全チームのバイト列を確認
        const rawName = bytes.slice(nameOffset, nameOffset + 12);
        console.log(`Read [${offset.toString(16)}] Name:`, rawName, '->', name);

        // オーナー名 (Offset 0x6Cへ変更: チーム名同様に2バイト前倒し)
        // 0x54(Name) + 24byte = 0x6C
        const ownerOffset = offset + 0x6C;
        const owner = this.readSJISString(bytes, ownerOffset, 24);

        const rawOwner = bytes.slice(ownerOffset, ownerOffset + 12);
        console.log(`Read [${offset.toString(16)}] Owner:`, rawOwner, '->', owner);

        return {
            name: name || '',
            owner: owner || '',
            colors: colors,
            primaryColor: colors[1] || colors[0] || { r: 128, g: 128, b: 128, a: 255 }
        };
    },

    /**
     * マッチ結果を抽出
     */
    /**
     * マッチ結果を抽出
     * @returns {Array} 2次元配列 results[i][j] = 0:なし, 1:勝, 2:負, 3:引分
     */
    extractMatchResults: function (bytes, teamCount) {
        const results = [];

        // 2次元配列の初期化
        for (let i = 0; i < teamCount; i++) {
            results[i] = new Array(teamCount).fill(0);
        }

        // 勝敗データの読み込み
        // 15チーム総当たり = 105試合
        // データ格納場所: 0x3208 + 832 (チームデータ終了) 以降？
        // 実際にはファイルの末尾付近にあると思われるが、詳細なオフセットは不明。
        // ここでは仮に、0x3548 (SLOT_START_OFFSET + 15 * SLOT_SIZE) から読み込むとする。

        const matchStartOffset = 0x488 + (15 * 832); // 0x3548

        if (matchStartOffset >= bytes.length) {
            console.warn('Match data offset out of range');
            return results;
        }

        let currentByte = 0;
        let bitPos = 0;
        let byteOffset = 0;

        for (let i = 0; i < 15; i++) {
            for (let j = i + 1; j < 15; j++) {
                if (bitPos === 0) {
                    if (matchStartOffset + byteOffset < bytes.length) {
                        currentByte = bytes[matchStartOffset + byteOffset];
                    } else {
                        currentByte = 0;
                    }
                    byteOffset++;
                }

                // 2bit読み込み
                const res = (currentByte >> bitPos) & 0x03;
                bitPos += 2;
                if (bitPos >= 8) bitPos = 0;

                // 実際のチーム数内であれば結果を格納
                if (i < teamCount && j < teamCount) {
                    results[i][j] = res;

                    // 対称性の維持
                    let opponentRes = 0;
                    if (res === 1) opponentRes = 2; // 勝 -> 負
                    else if (res === 2) opponentRes = 1; // 負 -> 勝
                    else opponentRes = res; // 引分(3) -> 引分(3), なし(0) -> なし(0)

                    results[j][i] = opponentRes;
                }
            }
        }

        return results;
    },

    // ユーティリティ関数
    // Shift-JIS文字列を読み込む（NULL文字スキップ対応）
    readSJISString: function (bytes, offset, length) {
        // 範囲チェック
        if (offset >= bytes.length) return '';

        // 先頭のNULLバイトや0xFF(パディング)をスキップ
        let start = offset;
        while (start < offset + length && start < bytes.length && (bytes[start] === 0 || bytes[start] === 0xFF)) {
            start++;
        }

        if (start >= offset + length || start >= bytes.length) return '';

        // 指定長またはNULL文字まで読み込む
        const slice = bytes.slice(start, offset + length);
        const str = Encoding.toUTF8(slice);

        // 末尾のNULL文字以降を除去
        return str ? str.trim().replace(/\0.*$/, '') : '';
    },

    readString: function (bytes, offset, length) {
        let str = '';
        for (let i = 0; i < length; i++) {
            if (offset + i < bytes.length && bytes[offset + i] !== 0) {
                str += String.fromCharCode(bytes[offset + i]);
            }
        }
        return str;
    },

    readUint8: function (bytes, offset) {
        if (offset >= bytes.length) return 0;
        return bytes[offset];
    },

    readUint16: function (bytes, offset) {
        if (offset + 2 > bytes.length) return 0;
        return bytes[offset] | (bytes[offset + 1] << 8);
    },

    readUint32: function (bytes, offset) {
        // リトルエンディアン
        if (offset + 4 > bytes.length) return 0;
        return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
    },

    /**
     * CHEファイルを生成（チーム形式）
     */
    generateTeamFile: function (teams) {
        if (teams.length === 0) return new Uint8Array(0);

        // 各チームのrawBufferサイズを合計
        let totalSize = 0;
        teams.forEach(team => {
            if (team.rawBuffer) {
                totalSize += team.rawBuffer.byteLength;
            } else {
                totalSize += 24512;
            }
        });

        const output = new Uint8Array(totalSize);
        let offset = 0;

        teams.forEach(team => {
            if (team.rawBuffer) {
                output.set(new Uint8Array(team.rawBuffer), offset);
                offset += team.rawBuffer.byteLength;
            }
        });

        return output.buffer;
    },

    /**
     * CHEファイルを生成（マッチ形式）
     * @param {Array} teams - チームデータ配列
     * @param {string} tournamentName - 大会名
     * @returns {ArrayBuffer} CEMDマッチファイル
     * 注: 勝敗データは保存しない（ユーザー要望により）
     */
    generateMatchFile: function (teams, tournamentName = '新規大会') {
        const teamCount = teams.length;

        // 解析に基づく固定パラメータ
        const TOTAL_FILE_SIZE = 266232;
        const HEADER_SIZE = 0x148;       // 328 bytes
        const SLOT_SIZE = 832;           // 0x340 bytes
        const SLOT_START_OFFSET = 0x488; // Slot 1からデータ開始

        // バッファ作成（ゼロ初期化）
        const output = new Uint8Array(TOTAL_FILE_SIZE);
        const view = new DataView(output.buffer);

        // 1. ヘッダー情報作成
        output[0] = 0x43; output[1] = 0x45; output[2] = 0x4D; output[3] = 0x44;
        view.setUint16(4, HEADER_SIZE, true);
        const version = "0.0.44";
        for (let i = 0; i < version.length && i < 8; i++) {
            output[8 + i] = version.charCodeAt(i);
        }
        const nameBytes = Encoding.toSJIS(tournamentName);
        for (let i = 0; i < nameBytes.length && i < 32; i++) {
            output[0x10 + i] = nameBytes[i];
        }
        output[0x30] = 0xCD; output[0x31] = 0xCD; output[0x32] = 0xCD; output[0x33] = 0xCD;
        view.setUint32(0x34, teamCount, true);
        const matchCount = (teamCount * (teamCount - 1)) / 2;
        view.setUint32(0x38, matchCount, true);
        view.setUint32(0x40, 0, true);
        view.setFloat32(0x44, 528, true);
        view.setFloat32(0x48, 120, true);
        view.setFloat32(0x4C, 1.0, true);
        for (let i = 0x70; i < 0xE4; i++) {
            output[i] = 0x01;
        }

        // 2. チームデータ書き込み
        teams.forEach((team, index) => {
            const slotStart = SLOT_START_OFFSET + (index * SLOT_SIZE);
            if (slotStart + SLOT_SIZE > TOTAL_FILE_SIZE) return;

            // カラーパレット (Offset 0x18)
            // match.CHEのスペース制限により15色まで
            const colorOffset = slotStart + 0x18;

            // match.CHE由来の場合はrawBufferを優先（完全なデータ保持のため）
            if (team.isMatchDerived && team.rawBuffer) {
                const src = new Uint8Array(team.rawBuffer);
                // rawBufferはスロット全体なのでOffset 0x18から
                for (let k = 0; k < 60; k++) { // 15色 * 4 = 60 bytes
                    output[colorOffset + k] = src[0x18 + k];
                }
            } else if (team.rawBuffer && !team.isMatchDerived) {
                // team.CHE由来の場合、Offset 0x240から
                const src = new Uint8Array(team.rawBuffer);
                const srcColorOffset = 0x240;
                for (let k = 0; k < 60; k++) { // 15色 * 4 = 60 bytes
                    output[colorOffset + k] = src[srcColorOffset + k];
                }
            } else if (team.colors && team.colors.length > 0) {
                // colorsプロパティから生成（新規作成時など）
                for (let c = 0; c < 15; c++) {
                    const color = team.colors[c] || team.colors[0];
                    output[colorOffset + c * 4] = color.r;
                    output[colorOffset + c * 4 + 1] = color.g;
                    output[colorOffset + c * 4 + 2] = color.b;
                    output[colorOffset + c * 4 + 3] = color.a;
                }
            }

            // チーム名 (Offset 0x54へ変更)
            const nameOffset = slotStart + 0x54;
            let tNameBytes;

            if (team.rawBuffer) {
                if (team.isMatchDerived) {
                    // match.CHE由来の場合、rawBufferはスロット全体
                    const src = new Uint8Array(team.rawBuffer);
                    // 0x54から26バイト分確保（余裕を持って）
                    tNameBytes = src.slice(0x54, 0x54 + 26);
                } else {
                    // team.CHE由来の場合、rawBufferは全体データなのでOffset 0x280から
                    const src = new Uint8Array(team.rawBuffer);
                    if (src.byteLength >= 0x280 + 24) {
                        tNameBytes = src.slice(0x280, 0x280 + 24);
                    } else {
                        tNameBytes = Encoding.toSJIS(team.name);
                    }
                }
            } else {
                tNameBytes = Encoding.toSJIS(team.name);
            }

            // 書き込み時は最大26バイトまで許容（パレットとの隙間埋め）
            for (let k = 0; k < tNameBytes.length && k < 26; k++) {
                output[nameOffset + k] = tNameBytes[k];
            }
            // デバッグ: 書き込みバイト列
            // console.log(`Write [${slotStart.toString(16)}] Name:`, tNameBytes.slice(0, 10), 'Src:', team.name);

            // オーナー名 (Offset 0x6Cへ変更)
            const ownerOffset = slotStart + 0x6C;
            // output[ownerOffset] = 0x00; // パディング廃止（詰めて書く）

            let oNameBytes;
            if (team.rawBuffer) {
                if (team.isMatchDerived) {
                    // match.CHE由来の場合
                    const src = new Uint8Array(team.rawBuffer);
                    // 0x6Cから24バイトコピー
                    oNameBytes = src.slice(0x6C, 0x6C + 24);
                } else {
                    // team.CHE由来の場合 (Owner Offset 0x298)
                    const src = new Uint8Array(team.rawBuffer);
                    if (src.byteLength >= 0x298 + 24) {
                        oNameBytes = src.slice(0x298, 0x298 + 24);
                        // パディング除去処理（先頭が00ならスキップ）
                        let start = 0;
                        while (start < oNameBytes.length && oNameBytes[start] === 0) start++;
                        oNameBytes = oNameBytes.slice(start, 24);
                    } else {
                        oNameBytes = Encoding.toSJIS(team.owner || '');
                    }
                }
            } else {
                oNameBytes = Encoding.toSJIS(team.owner || '');
            }

            for (let k = 0; k < oNameBytes.length && k < 24; k++) {
                output[ownerOffset + k] = oNameBytes[k];
            }
            // デバッグ
            // console.log(`Write [${slotStart.toString(16)}] Owner (w/pad):`, oNameBytes.slice(0, 10), 'Src:', team.owner);
        });

        // マッチ結果の書き込み
        // 15チーム総当たり = 105試合
        // 各試合の結果は2ビットで表現されると思われるが、解析によると
        // 0x3208以降のチームデータ領域の後ろに結果データがある？
        // いや、extractMatchResultsの実装を見ると、チームデータ領域の後ろではなく
        // ファイルの末尾の方にあるはず。

        // 解析に基づく結果データオフセット
        // 15チームの場合、0x3208 + 832 = 0x3548 がチームデータの終わり
        // 結果データはどこ？
        // extractMatchResultsでは:
        // const matchDataOffset = 0x3548; // 仮定

        // ユーザー要望により、勝敗データは保存しない
        // 全試合「対戦なし(0)」で埋める

        const matchStartOffset = SLOT_START_OFFSET + (15 * SLOT_SIZE); // 0x3548

        // 結果データの書き込み
        // 1バイトに4試合分の結果が入る (2bit * 4)
        // 00: なし, 01: 勝(Home), 10: 負(Home), 11: 引分

        let currentByte = 0;
        let bitPos = 0;
        let byteOffset = 0;

        for (let i = 0; i < 15; i++) {
            for (let j = i + 1; j < 15; j++) {
                // 常に「対戦なし(0)」を書き込む
                let res = 0;

                // 2bit書き込み
                // 下位ビットから埋めるか上位からか？
                // extractMatchResults: (byte >> (k * 2)) & 0x03
                // 下位ビットから順に埋まっている

                currentByte |= (res & 0x03) << bitPos;
                bitPos += 2;

                if (bitPos >= 8) {
                    view.setUint8(matchStartOffset + byteOffset, currentByte);
                    byteOffset++;
                    currentByte = 0;
                    bitPos = 0;
                }
            }
        }

        // 残りのバイトを書き込み
        if (bitPos > 0) {
            view.setUint8(matchStartOffset + byteOffset, currentByte);
        }

        return output.buffer;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CHEParser;
}
