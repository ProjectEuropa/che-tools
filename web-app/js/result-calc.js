/**
 * Result Calculator - 結果集計機能（ECMX相当）
 */

const ResultCalc = {
    standings: [],
    isManualOrder: false, // 手動並べ替えフラグ

    /**
     * 初期化
     */
    init: function () {
        this.bindEvents();
    },

    /**
     * イベントバインド
     */
    bindEvents: function () {
        // 集計実行ボタン
        const calcBtn = document.getElementById('calc-button');
        if (calcBtn) {
            calcBtn.addEventListener('click', () => this.calculate());
        }

        // データソース変更時に自動再計算
        const dataSource = document.getElementById('data-source');
        if (dataSource) {
            dataSource.addEventListener('change', () => {
                // データが存在する場合のみ自動計算
                if (window.TableViewer && TableViewer.teams && TableViewer.teams.length > 0) {
                    this.calculate();
                }
            });
        }

        // 勝点設定変更時に再計算
        ['win-point', 'draw-point', 'lose-point'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    // データが存在する場合のみ自動計算
                    if (this.standings.length > 0) {
                        this.calculate();
                    }
                });
            }
        });

        // コピーボタン
        const copyBtn = document.getElementById('copy-result');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copyResult());
        }

        // 順位リセットボタン
        const resetBtn = document.getElementById('reset-ranking');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.isManualOrder = false;
                this.calculate();
            });
        }
    },

    /**
     * 集計計算
     */
    calculate: function () {
        console.log('ResultCalc.calculate() called');

        // TableViewerからデータを取得
        if (!window.TableViewer) {
            console.error('TableViewer not found');
            this.renderEmpty();
            return;
        }

        if (!TableViewer.teams || TableViewer.teams.length === 0) {
            console.error('No teams data');
            this.renderEmpty();
            return;
        }

        const teams = TableViewer.teams;
        const dataSource = document.getElementById('data-source')?.value || 'asc';

        console.log('Teams:', teams.length);
        console.log('Data source:', dataSource);

        // データソースに応じて結果データを取得
        let results;
        if (dataSource === 'asc') {
            results = TableViewer.resultsAsc;
        } else if (dataSource === 'desc') {
            results = TableViewer.resultsDesc;
        } else if (dataSource === 'merged') {
            // 両方を合算
            results = this.mergeResults(TableViewer.resultsAsc, TableViewer.resultsDesc, teams.length);
        }

        console.log('Results:', results);

        if (!results || results.length === 0) {
            console.error('No results data');
            this.renderEmpty();
            return;
        }

        // 勝点設定を取得
        const winPt = parseInt(document.getElementById('win-point')?.value) || 3;
        const drawPt = parseInt(document.getElementById('draw-point')?.value) || 1;
        const losePt = parseInt(document.getElementById('lose-point')?.value) || 0;

        console.log('Point settings:', { winPt, drawPt, losePt });

        // 各チームの成績を計算
        this.standings = teams.map((team, index) => {
            let wins = 0, draws = 0, losses = 0;

            if (dataSource === 'merged') {
                // 両方を合算：正順と逆順の勝敗を別々にカウント
                // 正順データ
                if (TableViewer.resultsAsc[index]) {
                    TableViewer.resultsAsc[index].forEach((result, j) => {
                        if (index === j) return;
                        if (result === 1) wins++;
                        else if (result === 2) losses++;
                        else if (result === 3) draws++;
                    });
                }
                // 逆順データ
                if (TableViewer.resultsDesc[index]) {
                    TableViewer.resultsDesc[index].forEach((result, j) => {
                        if (index === j) return;
                        if (result === 1) wins++;
                        else if (result === 2) losses++;
                        else if (result === 3) draws++;
                    });
                }
            } else {
                // 正順または逆順のみ
                if (results[index]) {
                    results[index].forEach((result, j) => {
                        if (index === j) return;
                        if (result === 1) wins++;
                        else if (result === 2) losses++;
                        else if (result === 3) draws++;
                    });
                }
            }

            const points = wins * winPt + draws * drawPt + losses * losePt;
            const played = wins + draws + losses;
            const winRate = played > 0 ? (wins / played * 100).toFixed(1) : 0;

            return {
                index,
                team,
                wins,
                draws,
                losses,
                played,
                points,
                winRate
            };
        });

        console.log('Standings:', this.standings);

        // 順位付け
        this.sortStandings();

        // 表示更新
        this.renderStandings();
        this.renderResultText();
    },

    /**
     * 2つの結果データを合算
     */
    mergeResults: function (resultsAsc, resultsDesc, teamCount) {
        console.log('mergeResults called');
        console.log('resultsAsc:', resultsAsc);
        console.log('resultsDesc:', resultsDesc);
        console.log('teamCount:', teamCount);

        const merged = [];
        for (let i = 0; i < teamCount; i++) {
            merged[i] = new Array(teamCount).fill(0);
            for (let j = 0; j < teamCount; j++) {
                if (i === j) continue;

                const resAsc = resultsAsc[i][j] || 0;
                const resDesc = resultsDesc[i][j] || 0;

                // 両方の結果を合算
                // 同じ結果が2回あれば、そのまま採用
                // 異なる結果（勝と負など）があれば、両方をカウント
                if (resAsc === 0 && resDesc === 0) {
                    merged[i][j] = 0; // なし
                } else if (resAsc !== 0 && resDesc === 0) {
                    merged[i][j] = resAsc; // 正順のみ
                } else if (resAsc === 0 && resDesc !== 0) {
                    merged[i][j] = resDesc; // 逆順のみ
                } else {
                    // 両方に結果がある場合
                    // 簡易実装：最初の結果を優先（正順）
                    // より複雑なロジックが必要な場合は後で修正
                    merged[i][j] = resAsc;
                }
            }
        }

        console.log('merged result:', merged);
        return merged;
    },

    /**
     * 順位ソート
     */
    sortStandings: function () {
        // 手動並べ替えモードの場合は、現在の順序を維持
        if (this.isManualOrder) {
            // 順位番号だけ更新
            this.standings.forEach((s, i) => {
                s.rank = i + 1;
            });
            return;
        }

        this.standings.sort((a, b) => {
            // 勝点 -> 勝数 -> 勝率
            if (b.points !== a.points) return b.points - a.points;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return parseFloat(b.winRate) - parseFloat(a.winRate);
        });

        // 順位を付与
        this.standings.forEach((s, i) => {
            s.rank = i + 1;
        });
    },

    /**
     * 順位表を描画
     */
    renderStandings: function () {
        const container = document.getElementById('standings-table');

        if (this.standings.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted);">データがありません</p>';
            return;
        }

        let html = '<table id="standings-table-element">';
        html += '<thead><tr>';
        html += '<th>順位</th>';
        html += '<th>チーム</th>';
        html += '<th>試合</th>';
        html += '<th>勝</th>';
        html += '<th>分</th>';
        html += '<th>敗</th>';
        html += '<th>勝点</th>';
        html += '<th>倍率</th>';
        html += '<th>補正後</th>';
        html += '<th>勝率</th>';
        html += '</tr></thead>';
        html += '<tbody>';

        this.standings.forEach((s, idx) => {
            const rankIcon = s.rank === 1 ? '🥇' : s.rank === 2 ? '🥈' : s.rank === 3 ? '🥉' : '';
            const multiplier = s.multiplier || 1.0;
            const adjustedPoints = (s.points * multiplier).toFixed(1);

            html += `<tr draggable="true" data-index="${idx}">`;
            html += `<td>${rankIcon} ${s.rank}位</td>`;
            html += `<td style="text-align: left;">${s.team.name}</td>`;
            html += `<td>${s.played}</td>`;
            html += `<td>${s.wins}</td>`;
            html += `<td>${s.draws}</td>`;
            html += `<td>${s.losses}</td>`;
            html += `<td><strong>${s.points}</strong></td>`;
            html += `<td><input type="number" class="multiplier-input" data-index="${idx}" value="${multiplier}" step="0.1" min="0" style="width: 60px;"></td>`;
            html += `<td><strong>${adjustedPoints}</strong></td>`;
            html += `<td>${s.winRate}%</td>`;
            html += '</tr>';
        });

        html += '</tbody></table>';
        container.innerHTML = html;

        // 倍率入力イベントを設定
        this.setupMultiplierInputs();

        // ドラッグ&ドロップイベントを設定
        this.setupDragAndDrop();
    },

    /**
     * 倍率入力イベントを設定
     */
    setupMultiplierInputs: function () {
        const inputs = document.querySelectorAll('.multiplier-input');
        inputs.forEach(input => {
            input.addEventListener('change', (e) => {
                const index = parseInt(e.target.dataset.index);
                const multiplier = parseFloat(e.target.value) || 1.0;
                this.standings[index].multiplier = multiplier;

                // 表示を更新
                this.renderStandings();
                this.renderResultText();
            });
        });
    },

    /**
     * ドラッグ&ドロップ機能を設定
     */
    setupDragAndDrop: function () {
        const tbody = document.querySelector('#standings-table-element tbody');
        if (!tbody) return;

        let draggedRow = null;

        tbody.querySelectorAll('tr').forEach(row => {
            row.addEventListener('dragstart', (e) => {
                draggedRow = row;
                row.style.opacity = '0.5';
            });

            row.addEventListener('dragend', (e) => {
                row.style.opacity = '';
            });

            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                const afterElement = this.getDragAfterElement(tbody, e.clientY);
                if (afterElement == null) {
                    tbody.appendChild(draggedRow);
                } else {
                    tbody.insertBefore(draggedRow, afterElement);
                }
            });

            row.addEventListener('drop', (e) => {
                e.preventDefault();
                // 並べ替えが完了したら、standingsの順序を更新
                this.updateStandingsOrder();
            });
        });
    },

    /**
     * ドラッグ位置に基づいて挿入位置を決定
     */
    getDragAfterElement: function (container, y) {
        const draggableElements = [...container.querySelectorAll('tr:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;

            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    },

    /**
     * ドラッグ&ドロップ後にstandingsの順序を更新
     */
    updateStandingsOrder: function () {
        const tbody = document.querySelector('#standings-table-element tbody');
        if (!tbody) return;

        const newOrder = [];
        tbody.querySelectorAll('tr').forEach(row => {
            const index = parseInt(row.dataset.index);
            newOrder.push(this.standings[index]);
        });

        this.standings = newOrder;
        this.isManualOrder = true; // 手動並べ替えフラグをON

        // 順位番号を更新して再描画
        this.standings.forEach((s, i) => {
            s.rank = i + 1;
        });

        this.renderStandings();
        this.renderResultText();
    },

    /**
     * 結果テキストを生成
     */
    renderResultText: function () {
        const container = document.getElementById('result-text');

        if (this.standings.length === 0) {
            container.textContent = '';
            return;
        }

        const dataSource = document.getElementById('data-source')?.value || 'asc';
        const sourceLabel = dataSource === 'asc' ? '正順データ' : dataSource === 'desc' ? '逆順データ' : '両方を合算';

        let text = '';

        // 両方を合算の場合は、正順と逆順の両方のマトリクスを出力
        if (dataSource === 'merged') {
            // 正順マトリクス
            text += this.generateMatrixText('正順データ', TableViewer.resultsAsc);
            text += '\n';
            // 逆順マトリクス
            text += this.generateMatrixText('逆順データ', TableViewer.resultsDesc);
            text += '\n';
        } else {
            // 単一のマトリクス
            const results = dataSource === 'asc' ? TableViewer.resultsAsc : TableViewer.resultsDesc;
            text += this.generateMatrixText(sourceLabel, results);
            text += '\n';
        }

        // チーム詳細情報
        text += 'No チーム名 オーナー名\n';
        this.standings.forEach((standing, idx) => {
            if (idx >= 10) return;

            const team = standing.team;
            text += String(standing.index + 1).padStart(2, '0') + ' ';
            text += team.name;
            if (team.owner) {
                text += ' ' + team.owner;
            }
            text += '\n';
        });

        text += '\n';

        // 順位表（従来形式）
        text += `==順位表 (${sourceLabel})==\n`;
        text += 'Rank No Point Adj Result : Team\n';
        text += '-'.repeat(50) + '\n';

        this.standings.forEach(s => {
            const wins = String(s.wins).padStart(2, '0');
            const draws = String(s.draws).padStart(2, '0');
            const losses = String(s.losses).padStart(2, '0');
            const points = String(s.points).padStart(2, '0');
            const multiplier = s.multiplier || 1.0;
            const adjustedPoints = (s.points * multiplier).toFixed(1);

            text += `${String(s.rank).padStart(2, '0')}位 `;
            text += `${String(s.index + 1).padStart(2, '0')} `;
            text += `${points}p `;
            if (multiplier !== 1.0) {
                text += `(×${multiplier}=${adjustedPoints}) `;
            }
            text += `(${wins}-${draws}-${losses}) `;
            text += `: ${s.team.name}`;
            if (s.team.owner) {
                text += ` [${s.team.owner}]`;
            }
            text += '\n';
        });

        text += '==ここまで==\n';

        container.textContent = text;
    },

    /**
     * マトリクステキストを生成
     */
    generateMatrixText: function (label, results) {
        let text = '';

        // 対戦マトリクス表
        text += '対戦マトリクス (' + label + ')\n';
        text += 'No ';

        // ヘッダー行
        for (let i = 0; i < this.standings.length && i < 10; i++) {
            text += String(this.standings[i].index + 1).padStart(2, '0') + ' ';
        }
        text += '\n';

        // データ行
        this.standings.forEach((standing, idx) => {
            if (idx >= 10) return; // 最大10チームまで表示

            const i = standing.index;
            text += String(i + 1).padStart(2, '0') + ' ';

            this.standings.forEach((otherStanding, otherIdx) => {
                if (otherIdx >= 10) return;

                const j = otherStanding.index;

                if (i === j) {
                    text += '＼ ';
                } else {
                    const result = results[i][j];
                    let symbol = '  ';
                    if (result === 1) symbol = '○';
                    else if (result === 2) symbol = '×';
                    else if (result === 3) symbol = '△';
                    else symbol = '－';
                    text += symbol + ' ';
                }
            });

            // この行のチームの勝敗数（このマトリクスのみ）
            let wins = 0, losses = 0, draws = 0;
            if (results[i]) {
                results[i].forEach((result, j) => {
                    if (i === j) return;
                    if (result === 1) wins++;
                    else if (result === 2) losses++;
                    else if (result === 3) draws++;
                });
            }

            text += String(wins).padStart(2, '0') + '-';
            text += String(losses).padStart(2, '0') + '-';
            text += String(draws).padStart(2, '0');
            text += '\n';
        });

        return text;
    },

    /**
     * 空の状態を描画
     */
    renderEmpty: function () {
        const standingsContainer = document.getElementById('standings-table');
        const textContainer = document.getElementById('result-text');

        standingsContainer.innerHTML = '<p style="color: var(--text-muted);">マッチデータを読み込んでください</p>';
        textContainer.textContent = '';
    },

    /**
     * 結果をクリップボードにコピー
     */
    copyResult: function () {
        const text = document.getElementById('result-text').textContent;

        if (!text) {
            if (window.App && App.showToast) {
                App.showToast('コピーする結果がありません', 'error');
            }
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            if (window.App && App.showToast) {
                App.showToast('結果をコピーしました', 'success');
            }
        }).catch(err => {
            console.error('Copy failed:', err);
            if (window.App && App.showToast) {
                App.showToast('コピーに失敗しました', 'error');
            }
        });
    },

    /**
     * リセット
     */
    reset: function () {
        this.standings = [];
        this.renderEmpty();
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResultCalc;
}
