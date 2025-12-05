/**
 * Table Viewer - 勝敗表表示機能（CarTa/CarVi相当）
 */

const TableViewer = {
    matchData: null,
    teams: [],
    resultsAsc: [],  // 正順用データ
    resultsDesc: [], // 逆順用データ

    /**
     * 初期化
     */
    init: function () {
        // 初期化処理（イベントリスナーなど）
    },

    /**
     * マッチデータを設定
     */
    setMatchData: function (data) {
        if (data.type !== 'match') return;

        this.matchData = data;
        this.teams = data.teams;

        // 両方のデータセットに同じ結果をコピー
        this.resultsAsc = JSON.parse(JSON.stringify(data.results));
        this.resultsDesc = JSON.parse(JSON.stringify(data.results));

        this.renderMatchInfo();
        this.renderAllTables();
    },

    /**
     * チームデータから勝敗表を生成
     */
    setTeamsForManualInput: function (teams) {
        this.teams = teams;

        // 両方のデータセットを初期化
        this.resultsAsc = [];
        this.resultsDesc = [];
        teams.forEach((team, i) => {
            this.resultsAsc.push(new Array(teams.length).fill(0));
            this.resultsDesc.push(new Array(teams.length).fill(0));
        });

        this.renderMatchInfo();
        this.renderAllTables();
    },

    /**
     * 全てのテーブルを描画
     */
    renderAllTables: function () {
        this.renderTable('table-container', false); // 対戦表（正順）
        this.renderTable('table-container-reverse', true); // 対戦表（逆順）
        this.renderResultTable('result-table-container', false); // 集計結果（正順）
        this.renderResultTable('result-table-container-reverse', true); // 集計結果（逆順）
    },

    /**
     * マッチ情報を表示
     */
    renderMatchInfo: function () {
        const container = document.getElementById('match-info');

        if (this.matchData && this.matchData.header) {
            const h = this.matchData.header;
            container.innerHTML = `
                <h2>${h.tournamentName || 'マッチデータ'}</h2>
                <div class="meta">
                    <span>チーム数: ${this.teams.length}</span>
                    <span>バージョン: ${h.version || '-'}</span>
                </div>
            `;
        } else {
            container.innerHTML = `
                <h2>勝敗表</h2>
                <div class="meta">
                    <span>チーム数: ${this.teams.length}</span>
                </div>
            `;
        }
    },

    /**
     * テーブルを描画
     * @param {string} containerId - コンテナID
     * @param {boolean} isReverse - 逆順かどうか
     */
    renderTable: function (containerId, isReverse) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = '';

        if (!this.teams || this.teams.length === 0) return;

        // 使用するデータセットを選択
        const results = isReverse ? this.resultsDesc : this.resultsAsc;

        const table = document.createElement('table');
        table.className = 'match-table';

        // 表示順序の決定
        const indices = this.teams.map((_, i) => i);
        if (isReverse) {
            indices.reverse();
        }

        // ヘッダー行
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');
        headerRow.appendChild(document.createElement('th')); // 左上の空白

        indices.forEach(index => {
            const team = this.teams[index];
            const th = document.createElement('th');
            th.className = 'team-header';

            // チーム名
            const nameDiv = document.createElement('div');
            nameDiv.className = 'vertical-text';
            nameDiv.textContent = team.name.substring(0, 6);
            th.appendChild(nameDiv);

            // 色帯
            th.style.borderBottom = `3px solid rgb(${team.primaryColor.r}, ${team.primaryColor.g}, ${team.primaryColor.b})`;

            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // ボディ
        const tbody = document.createElement('tbody');
        indices.forEach(rowIndex => {
            const rowTeam = this.teams[rowIndex];
            const tr = document.createElement('tr');

            // 行ヘッダー
            const th = document.createElement('th');
            th.className = 'row-header';
            th.textContent = rowTeam.name;
            th.style.borderLeft = `5px solid rgb(${rowTeam.primaryColor.r}, ${rowTeam.primaryColor.g}, ${rowTeam.primaryColor.b})`;
            tr.appendChild(th);

            // セル
            indices.forEach(colIndex => {
                const td = document.createElement('td');

                if (rowIndex === colIndex) {
                    td.className = 'diagonal';
                } else {
                    // 結果を表示
                    const result = results[rowIndex][colIndex];
                    td.className = 'result-cell';

                    if (result === 1) {
                        td.textContent = '○';
                        td.className += ' win';
                    } else if (result === 2) {
                        td.textContent = '❌';
                        td.className += ' lose';
                    } else if (result === 3) {
                        td.textContent = '△';
                        td.className += ' draw';
                    } else {
                        // 対戦なし
                    }

                    // クリックイベント（isReverseを渡す）
                    td.onclick = () => this.handleCellClick(rowIndex, colIndex, isReverse);
                    td.style.cursor = 'pointer';
                }
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        container.appendChild(table);
    },

    /**
     * セルクリック時の処理
     * @param {number} row - 行インデックス
     * @param {number} col - 列インデックス
     * @param {boolean} isReverse - 逆順テーブルかどうか
     */
    handleCellClick: function (row, col, isReverse) {
        console.log(`Cell clicked: ${row} vs ${col} (isReverse: ${isReverse})`);
        if (row === col) return;

        // 使用するデータセットを選択
        const results = isReverse ? this.resultsDesc : this.resultsAsc;

        let current = results[row][col] || 0;
        let next = (current + 1) % 4;

        // 対称性を維持して更新
        this.updateResult(row, col, next, isReverse);

        // 対応するテーブルのみ再描画
        if (isReverse) {
            this.renderTable('table-container-reverse', true);
            this.renderResultTable('result-table-container-reverse', true);
        } else {
            this.renderTable('table-container', false);
            this.renderResultTable('result-table-container', false);
        }

        // ResultCalc（別タブの集計機能）も更新
        if (window.ResultCalc) {
            // 正順データを使用（どちらか一方を選択）
            ResultCalc.calculate(this.teams, this.resultsAsc);
        }
    },

    /**
     * 結果を更新（対称性を維持）
     * @param {number} row - 行インデックス
     * @param {number} col - 列インデックス
     * @param {number} status - 新しいステータス
     * @param {boolean} isReverse - 逆順テーブルかどうか
     */
    updateResult: function (row, col, status, isReverse) {
        // 使用するデータセットを選択
        const results = isReverse ? this.resultsDesc : this.resultsAsc;

        // 自分側の更新
        results[row][col] = status;

        // 相手側の更新（勝敗は反転、引分・なしは同じ）
        let opponentStatus = 0;
        if (status === 1) opponentStatus = 2; // 勝 -> 負
        else if (status === 2) opponentStatus = 1; // 負 -> 勝
        else opponentStatus = status; // 引分(3) -> 引分(3), なし(0) -> なし(0)

        results[col][row] = opponentStatus;
    },

    /**
     * 現在の結果データを取得（保存用）
     */
    getResults: function () {
        // 正順データを返す
        return this.resultsAsc;
    },

    /**
     * 勝敗表（集計結果）を描画
     * @param {string} containerId - コンテナID
     * @param {boolean} isReverse - 逆順かどうか
     */
    renderResultTable: function (containerId, isReverse) {
        const container = document.getElementById(containerId);
        if (!container) return;

        if (this.teams.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align: center;">マッチデータを読み込んでください</p>';
            return;
        }

        // 使用するデータセットを選択
        const results = isReverse ? this.resultsDesc : this.resultsAsc;

        // 表示順序の決定
        let indices = this.teams.map((_, i) => i);
        if (isReverse) {
            indices.reverse();
        }

        let html = '<table class="result-table">';

        // ヘッダー行
        html += '<tr><th>No</th><th>チーム</th>';
        indices.forEach(i => {
            html += `<th>${String(i + 1).padStart(2, '0')}</th>`;
        });
        html += '<th>勝</th><th>分</th><th>敗</th><th>勝点</th></tr>';

        // データ行
        indices.forEach(i => {
            const team = this.teams[i];
            const stats = this.calculateTeamStats(i, results);

            html += `<tr>`;
            html += `<td>${String(i + 1).padStart(2, '0')}</td>`;
            html += `<td style="text-align: left;">
                <span class="team-color" style="display: inline-block; width: 12px; height: 12px; background: rgb(${team.primaryColor.r}, ${team.primaryColor.g}, ${team.primaryColor.b}); border-radius: 2px; margin-right: 4px; vertical-align: middle;"></span>
                ${team.name}
            </td>`;

            // 対戦結果
            indices.forEach(j => {
                if (i === j) {
                    html += '<td class="self">-</td>';
                } else {
                    const result = results[i][j];
                    let cls = '', symbol = '-';
                    if (result === 1) { cls = 'win'; symbol = '○'; }
                    else if (result === 2) { cls = 'lose'; symbol = '❌'; }
                    else if (result === 3) { cls = 'draw'; symbol = '△'; }

                    html += `<td class="${cls}">${symbol}</td>`;
                }
            });

            html += `<td>${stats.wins}</td>`;
            html += `<td>${stats.draws}</td>`;
            html += `<td>${stats.losses}</td>`;
            html += `<td><strong>${stats.points}</strong></td>`;
            html += '</tr>';
        });

        html += '</table>';
        container.innerHTML = html;
    },

    /**
     * チームの統計情報を計算
     * @param {number} teamIndex - チームインデックス
     * @param {Array} results - 使用するデータセット
     */
    calculateTeamStats: function (teamIndex, results) {
        let wins = 0, draws = 0, losses = 0;

        // 2次元配列として処理
        if (results[teamIndex]) {
            results[teamIndex].forEach((result, j) => {
                if (teamIndex === j) return;
                if (result === 1) wins++;
                else if (result === 2) losses++;
                else if (result === 3) draws++;
            });
        }

        // 勝点計算（デフォルト: 勝3, 分1, 敗0）
        const winPt = parseInt(document.getElementById('win-point')?.value) || 3;
        const drawPt = parseInt(document.getElementById('draw-point')?.value) || 1;
        const losePt = parseInt(document.getElementById('lose-point')?.value) || 0;

        return {
            wins,
            draws,
            losses,
            points: wins * winPt + draws * drawPt + losses * losePt
        };
    },

    /**
     * 対戦結果を取得（互換性のため残すが、直接アクセス推奨）
     */
    getMatchResult: function (teamA, teamB) {
        return this.results[teamA][teamB];
    },

    /**
     * 対戦結果を設定（手動入力用）
     */
    setMatchResult: function (teamA, teamB, result) {
        // teamA の結果を設定
        let teamAResult = this.results.find(r => r.teamIndex === teamA);
        if (!teamAResult) {
            teamAResult = { teamIndex: teamA, matches: [] };
            this.results.push(teamAResult);
        }
        teamAResult.matches[teamB] = result;

        // teamB の結果を設定（逆の結果）
        let teamBResult = this.results.find(r => r.teamIndex === teamB);
        if (!teamBResult) {
            teamBResult = { teamIndex: teamB, matches: [] };
            this.results.push(teamBResult);
        }
        const inverseResult = result === 'W' ? 'L' : result === 'L' ? 'W' : 'D';
        teamBResult.matches[teamA] = inverseResult;

        this.renderResultTable();
    },

    /**
     * チーム詳細を表示
     */
    showTeamDetail: function (teamIndex) {
        const team = this.teams[teamIndex];
        if (!team) return;

        const container = document.getElementById('team-detail');
        container.classList.remove('hidden');

        container.innerHTML = `
            <h3>${team.name}</h3>
            <p>オーナー: ${team.owner}</p>
            <div class="color-palette">
                ${team.colors.map((c, i) => `
                    <span style="display: inline-block; width: 20px; height: 20px; background: rgb(${c.r}, ${c.g}, ${c.b}); border: 1px solid #333;"></span>
                `).join('')}
            </div>
        `;
    },

    /**
     * リセット
     */
    reset: function () {
        this.matchData = null;
        this.teams = [];
        this.results = [];
        document.getElementById('match-info').innerHTML = '';
        document.getElementById('result-table-container').innerHTML = '';
        document.getElementById('team-detail').classList.add('hidden');
    }
};

// グローバルスコープに公開
window.TableViewer = TableViewer;

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TableViewer;
}
