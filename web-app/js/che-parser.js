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
                sourceIndex: 0,
                // team.CHE全体をrawBufferとして保存（match.CHE変換時に使用）
                rawBuffer: buffer.slice(0, buffer.byteLength),
                isMatchDerived: false // team.CHE由来であることを示す
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

                // OKEブロックデータも保存（新ファイル生成時にコピーするため）
                const OKE_BLOCK_START = 0x38BC;
                const OKE_BLOCK_SIZE = 7872;
                team.okeBlocks = [];

                for (let okeNum = 0; okeNum < 3; okeNum++) {
                    const okeIndexOffset = offset + 0xB8 + okeNum * 48;
                    const okeIndex = this.readUint32(bytes, okeIndexOffset);

                    if (okeIndex < 31) {
                        const blockOffset = OKE_BLOCK_START + okeIndex * OKE_BLOCK_SIZE;
                        if (blockOffset + OKE_BLOCK_SIZE <= buffer.byteLength) {
                            team.okeBlocks.push({
                                originalIndex: okeIndex,
                                data: buffer.slice(blockOffset, blockOffset + OKE_BLOCK_SIZE)
                            });
                        }
                    }
                }

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
        // カラーパレット (Offset 0x14)
        // 16色 x 4バイト = 64バイト (0x14-0x53)
        const colorOffset = offset + 0x14;
        const colors = [];
        for (let i = 0; i < 16; i++) {
            const r = bytes[colorOffset + i * 4];
            const g = bytes[colorOffset + i * 4 + 1];
            const b = bytes[colorOffset + i * 4 + 2];
            const a = bytes[colorOffset + i * 4 + 3];
            colors.push({ r, g, b, a });
        }

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

    // テンプレートデータ（template.CHEから読み込む）
    templateData: null,

    // テンプレート読み込み
    loadTemplate: async function () {
        try {
            const response = await fetch('template.CHE');
            if (!response.ok) throw new Error('Template load failed');
            const buffer = await response.arrayBuffer();
            this.templateData = new Uint8Array(buffer);
            console.log('Template loaded:', this.templateData.byteLength);
            return true;
        } catch (e) {
            console.error('Failed to load template:', e);
            this.templateData = null;
            // トースト通知を使用（index.htmlで定義されている）
            if (typeof showToast === 'function') {
                showToast('テンプレートファイルの読み込みに失敗しました。', 'error');
            } else {
                alert('テンプレートファイルの読み込みに失敗しました。');
            }
            return false;
        }
    },

    /**
     * CHEファイルを生成（マッチ形式）
     * @param {Array} teams - チームデータ配列
     * @param {String} tournamentName - 大会名
     * @returns {Uint8Array} 生成されたCHEファイルデータ
     */
    // 注: 勝敗データは保存しない（ユーザー要望により）
    generateMatchFile: function (teams, tournamentName = '新規大会') {
        if (!this.templateData) {
            throw new Error('テンプレートが読み込まれていません');
        }

        // 解析に基づく固定パラメータ
        const TOTAL_FILE_SIZE = 266232;
        const SLOT_SIZE = 832;           // 0x340 bytes
        const SLOT_START_OFFSET = 0x488; // Slot 1からデータ開始
        const OKE_BLOCK_START = 0x38BC;
        const OKE_BLOCK_SIZE = 7872;
        const OKE_MAGIC = [0xC8, 0xE7, 0xAC, 0x08];
        const OKE_FLAG = [0x01, 0x00, 0x00, 0x00];
        const MAX_OKE_BLOCKS = 31;

        // バッファ作成 - SML.CHE（動作確認済みテンプレート）を完全コピー
        const output = new Uint8Array(TOTAL_FILE_SIZE);
        const view = new DataView(output.buffer);
        output.set(this.templateData.slice(0, TOTAL_FILE_SIZE));

        // ヘッダー: 大会名を書き込み
        const tNameBytes = Encoding.toSJIS(tournamentName);
        // 0x18: 大会名1
        for (let i = 0x18; i < 0x28; i++) output[i] = 0;
        for (let i = 0; i < tNameBytes.length && i < 16; i++) {
            output[0x18 + i] = tNameBytes[i];
        }
        // 0x168: 大会名2
        for (let i = 0x168; i < 0x180; i++) output[i] = 0;
        for (let i = 0; i < tNameBytes.length && i < 24; i++) {
            output[0x168 + i] = tNameBytes[i];
        }

        // チーム数・マッチ数を更新
        const teamCount = Math.min(teams.length, 16);
        const matchCount = (teamCount * (teamCount - 1)) / 2; // リーグ戦の場合
        view.setUint32(0x34, teamCount, true);
        view.setUint32(0x38, matchCount, true);
        view.setUint32(0x184, teamCount, true);
        view.setUint32(0x188, matchCount, true);

        console.log(`Generating match file: ${teamCount} teams, ${matchCount} matches, tournamentName=${tournamentName}`);

        if (teams.length > 16) {
            console.warn(`Warning: ${teams.length} teams provided, but only first 16 will be used`);
        }

        // OKEブロックインデックスをリセット（各生成時に0から開始）
        this._nextOkeBlockIndex = 0;

        // 元のインデックスから新しいインデックスへのマッピング（全チームで共有）
        const indexMap = {};

        // 2. 選択したチームのスロットのみ上書き（最大16チーム、残りはテンプレートのまま）
        teams.slice(0, 16).forEach((team, index) => {
            const slotStart = SLOT_START_OFFSET + (index * SLOT_SIZE);
            if (slotStart + SLOT_SIZE > TOTAL_FILE_SIZE) return;

            // デバッグ: チームデータの状態を確認
            console.log(`Slot ${index + 1}: name=${team.name}, isMatchDerived=${team.isMatchDerived}, hasRawBuffer=${!!team.rawBuffer}, rawBufferSize=${team.rawBuffer ? team.rawBuffer.byteLength : 0}`);

            // match.CHE由来のチームはrawBufferをコピーし、OKEブロックも再配置
            if (team.isMatchDerived && team.rawBuffer) {
                const src = new Uint8Array(team.rawBuffer);
                console.log(`  Copying rawBuffer: size=${src.length}`);

                // スロットデータをコピー
                for (let k = 0; k < SLOT_SIZE && k < src.length; k++) {
                    output[slotStart + k] = src[k];
                }

                // OKEブロックを新しい位置にコピーし、インデックスを更新
                if (team.okeBlocks && team.okeBlocks.length > 0) {
                    const OKE_BLOCK_START = 0x38BC;
                    const OKE_BLOCK_SIZE = 7872;

                    for (const okeBlock of team.okeBlocks) {
                        // 既にマップされていればスキップ（同じOKEを複数回コピーしない）
                        if (indexMap[okeBlock.originalIndex] !== undefined) {
                            continue;
                        }

                        const newIndex = this._nextOkeBlockIndex;
                        if (newIndex < MAX_OKE_BLOCKS) {
                            const blockData = new Uint8Array(okeBlock.data);
                            const destOffset = OKE_BLOCK_START + newIndex * OKE_BLOCK_SIZE;

                            // バッファオーバーフロー防止
                            if (destOffset + OKE_BLOCK_SIZE > TOTAL_FILE_SIZE) {
                                console.warn(`OKE block ${newIndex} would exceed file size, skipping`);
                                continue;
                            }

                            // OKEブロックをコピー（output.set()で効率化）
                            const copySize = Math.min(OKE_BLOCK_SIZE, blockData.length);
                            output.set(blockData.slice(0, copySize), destOffset);

                            indexMap[okeBlock.originalIndex] = newIndex;
                            this._nextOkeBlockIndex++;

                            // OKE名を取得してログ（Encoding.toUTF8を使用）
                            const okeNameBytes = blockData.slice(0x1C94, 0x1C94 + 24);
                            const okeName = Encoding.toUTF8(okeNameBytes).replace(/\0/g, '');
                            console.log(`    OKE Block ${okeBlock.originalIndex} -> ${newIndex}: ${okeName}`);
                        }
                    }

                    // スロット内のOKEサマリーインデックスを新しい値に更新
                    for (let okeNum = 0; okeNum < 3; okeNum++) {
                        const okeIndexOffset = slotStart + 0xB8 + okeNum * 48;
                        const oldIndex = view.getUint32(okeIndexOffset, true);

                        if (oldIndex < 31 && indexMap[oldIndex] !== undefined) {
                            view.setUint32(okeIndexOffset, indexMap[oldIndex], true);
                            console.log(`    Slot OKE${okeNum + 1} index: ${oldIndex} -> ${indexMap[oldIndex]}`);
                        }
                    }
                }

                return; // このチームは処理完了
            }

            // team.CHE由来の場合
            if (team.rawBuffer && !team.isMatchDerived) {
                const src = new Uint8Array(team.rawBuffer);
                console.log(`  Converting team.CHE: ${team.name}`);

                // マッピング: team.CHE → match.CHE slot
                // team.CHE構造: パレット0x240-0x27F, チーム名0x280, オーナー名0x298
                const copyMap = [
                    [0x240, 0x14, 64],   // パレット (0x240-0x27F → 0x14-0x53)
                    [0x280, 0x54, 24],   // チーム名 (0x280-0x297 → 0x54-0x6B)
                    [0x298, 0x6C, 24],   // オーナー名 (0x298-0x2AF → 0x6C-0x83)
                ];

                for (const [srcOff, dstOff, len] of copyMap) {
                    for (let k = 0; k < len && (srcOff + k) < src.byteLength; k++) {
                        output[slotStart + dstOff + k] = src[srcOff + k];
                    }
                }

                // OKEサマリーの初期化（無効スロットを有効化）
                // SML.CHEのBlock 0,1,2に有効なOKEがある（ほのお/くさ/みずタイプ）
                // 構造: [index(4B)][magic(4B)][flag(4B)][stats(36B)]
                const BASE_OKE_INDICES = [0, 1, 2]; // Block 0,1,2の有効なOKEを参照

                for (let okeNum = 0; okeNum < 3; okeNum++) {
                    const okeOffset = slotStart + 0xB8 + (okeNum * 48);

                    // 現在のインデックスを確認
                    const currentIndex = view.getUint32(okeOffset, true);

                    // 無効(-1)または0xCDパディングの場合、有効なインデックスで初期化
                    if (currentIndex === 0xFFFFFFFF || currentIndex === 0xCDCDCDCD) {
                        // インデックスを設定（Slot 0と同じOKEを参照）
                        view.setUint32(okeOffset, BASE_OKE_INDICES[okeNum], true);

                        // マジックを設定
                        for (let b = 0; b < 4; b++) {
                            output[okeOffset + 4 + b] = OKE_MAGIC[b];
                        }

                        // フラグを設定
                        for (let b = 0; b < 4; b++) {
                            output[okeOffset + 8 + b] = OKE_FLAG[b];
                        }

                        // 統計データはゼロクリア
                        for (let b = 12; b < 48; b++) {
                            output[okeOffset + b] = 0;
                        }

                        console.log(`    OKE${okeNum + 1} initialized: index=${BASE_OKE_INDICES[okeNum]}`);
                    }
                }

                console.log(`  Done: team.CHE converted`);
            }
        });

        // 残りのスロット(teams.length+1 ~ 16)はテンプレートのまま維持
        // PSPはスロット領域に有効なデータ構造を期待するため、ゼロクリアすると破損扱いになる
        console.log(`Slots ${teams.length + 1}-16: keeping template data`);

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

        console.log('Match file generation complete');
        return output.buffer;
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CHEParser;
}
