/**
 * Team Editor - チーム編集機能（CHX2_3相当）
 */

const TeamEditor = {
    sourceTeams: [],      // 読み込まれたチーム一覧
    outputTeams: [],      // 出力用チーム一覧
    selectedSource: [],   // 選択中のソースチーム
    selectedOutput: [],   // 選択中の出力チーム
    rawBuffers: [],       // 元ファイルのバッファ

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
        // 転送ボタン
        document.getElementById('add-team').addEventListener('click', () => this.addTeams());
        document.getElementById('remove-team').addEventListener('click', () => this.removeTeams());
        document.getElementById('move-up').addEventListener('click', () => this.moveUp());
        document.getElementById('move-down').addEventListener('click', () => this.moveDown());

        // コントロールボタン
        document.getElementById('select-all').addEventListener('click', () => this.selectAll());
        document.getElementById('shuffle-btn').addEventListener('click', () => this.shuffle());
        document.getElementById('clear-output').addEventListener('click', () => this.clearOutput());
        document.getElementById('reverse-btn').addEventListener('click', () => this.reverseOutput());

        // 保存ボタン
        document.getElementById('save-che').addEventListener('click', () => this.saveCHE());
    },

    /**
     * チームデータを追加
     */
    addTeamsFromFile: function (data, filename) {
        console.log('addTeamsFromFile:', data, filename);
        if (!data || !data.teams) return;

        // 大会名があれば反映
        if (data.header && data.header.tournamentName) {
            // ヌル文字などを除去して表示
            const tName = data.header.tournamentName.replace(/\0/g, '').trim();
            if (tName) {
                document.getElementById('tournament-name').value = tName;
            }
        }

        // 元ファイルのバッファを保存
        this.rawBuffers.push({
            filename: filename,
            buffer: data.raw
        });

        data.teams.forEach((team, index) => {
            team.sourceFile = filename;
            team.globalIndex = this.sourceTeams.length;

            // team.CHE (CETD) の場合のみ、全体バッファをチームデータとして保持
            // match.CHE (CEMD) の場合は個別バッファを持たず、プロパティから再生成させる
            if (data.type === 'team') {
                team.rawBuffer = data.raw;
            }

            this.sourceTeams.push(team);
        });
        console.log('Source teams count:', this.sourceTeams.length);

        this.renderSourceList();
    },

    /**
     * ソースリストを描画
     */
    renderSourceList: function () {
        const list = document.getElementById('source-teams');
        list.innerHTML = '';

        this.sourceTeams.forEach((team, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            li.className = this.selectedSource.includes(index) ? 'selected' : '';
            li.draggable = true; // ドラッグ可能に

            const color = team.primaryColor;

            // カラーバー
            const colorSpan = document.createElement('span');
            colorSpan.className = 'team-color';
            colorSpan.style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
            li.appendChild(colorSpan);

            // チーム名
            const nameSpan = document.createElement('span');
            nameSpan.className = 'team-name';
            nameSpan.textContent = team.name;
            li.appendChild(nameSpan);

            // オーナー名
            const ownerSpan = document.createElement('span');
            ownerSpan.className = 'team-owner';
            ownerSpan.textContent = team.owner;
            li.appendChild(ownerSpan);

            li.addEventListener('click', (e) => this.toggleSourceSelection(index, e.ctrlKey || e.metaKey));
            list.appendChild(li);
        });

        // ドラッグ&ドロップイベントを設定
        this.setupDragAndDrop('source-teams', 'sourceTeams');
    },

    /**
     * 出力リストを描画
     */
    renderOutputList: function () {
        const list = document.getElementById('output-teams');
        list.innerHTML = '';

        this.outputTeams.forEach((team, index) => {
            const li = document.createElement('li');
            li.dataset.index = index;
            li.className = this.selectedOutput.includes(index) ? 'selected' : '';
            li.draggable = true; // ドラッグ可能に

            const color = team.primaryColor;

            // カラーバー
            const colorSpan = document.createElement('span');
            colorSpan.className = 'team-color';
            colorSpan.style.background = `rgb(${color.r}, ${color.g}, ${color.b})`;
            li.appendChild(colorSpan);

            // チーム名
            const nameSpan = document.createElement('span');
            nameSpan.className = 'team-name';
            nameSpan.textContent = team.name;
            li.appendChild(nameSpan);

            // オーナー名
            const ownerSpan = document.createElement('span');
            ownerSpan.className = 'team-owner';
            ownerSpan.textContent = team.owner;
            li.appendChild(ownerSpan);

            li.addEventListener('click', (e) => this.toggleOutputSelection(index, e.ctrlKey || e.metaKey));
            list.appendChild(li);
        });

        // ドラッグ&ドロップイベントを設定
        this.setupDragAndDrop('output-teams', 'outputTeams');

        // 勝敗表タブにも反映
        if (window.TableViewer) {
            TableViewer.setTeamsForManualInput(this.outputTeams);
        }

        // カウント更新
        document.getElementById('team-count').textContent = `(${this.outputTeams.length}/16)`;

        // 保存ボタン状態更新
        const saveBtn = document.getElementById('save-che');
        saveBtn.disabled = this.outputTeams.length < 2 || this.outputTeams.length > 16;
    },

    /**
     * ソース選択切り替え
     */
    toggleSourceSelection: function (index, multi) {
        if (multi) {
            const pos = this.selectedSource.indexOf(index);
            if (pos === -1) {
                this.selectedSource.push(index);
            } else {
                this.selectedSource.splice(pos, 1);
            }
        } else {
            this.selectedSource = [index];
        }
        this.renderSourceList();
    },

    /**
     * 出力選択切り替え
     */
    toggleOutputSelection: function (index, multi) {
        if (multi) {
            const pos = this.selectedOutput.indexOf(index);
            if (pos === -1) {
                this.selectedOutput.push(index);
            } else {
                this.selectedOutput.splice(pos, 1);
            }
        } else {
            this.selectedOutput = [index];
        }
        this.renderOutputList();
    },

    /**
     * 選択したチームを出力リストに追加
     */
    addTeams: function () {
        const selected = this.selectedSource.sort((a, b) => a - b);

        selected.forEach(index => {
            const team = this.sourceTeams[index];
            if (!this.outputTeams.some(t => t.globalIndex === team.globalIndex)) {
                this.outputTeams.push({ ...team });
            }
        });

        this.selectedSource = [];
        this.renderSourceList();
        this.renderOutputList();
    },

    /**
     * 選択したチームを出力リストから削除
     */
    removeTeams: function () {
        const selected = [...this.selectedOutput].sort((a, b) => b - a);

        selected.forEach(index => {
            this.outputTeams.splice(index, 1);
        });

        this.selectedOutput = [];
        this.renderOutputList();
    },

    /**
     * 選択したチームを上に移動
     */
    moveUp: function () {
        if (this.selectedOutput.length !== 1) return;

        const index = this.selectedOutput[0];
        if (index === 0) return;

        const temp = this.outputTeams[index];
        this.outputTeams[index] = this.outputTeams[index - 1];
        this.outputTeams[index - 1] = temp;

        this.selectedOutput = [index - 1];
        this.renderOutputList();
    },

    /**
     * 選択したチームを下に移動
     */
    moveDown: function () {
        if (this.selectedOutput.length !== 1) return;

        const index = this.selectedOutput[0];
        if (index === this.outputTeams.length - 1) return;

        const temp = this.outputTeams[index];
        this.outputTeams[index] = this.outputTeams[index + 1];
        this.outputTeams[index + 1] = temp;

        this.selectedOutput = [index + 1];
        this.renderOutputList();
    },

    /**
     * 全選択
     */
    selectAll: function () {
        this.selectedSource = this.sourceTeams.map((_, i) => i);
        this.renderSourceList();
    },

    /**
     * シャッフル
     */
    shuffle: function () {
        // Fisher-Yates シャッフル
        for (let i = this.outputTeams.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.outputTeams[i], this.outputTeams[j]] = [this.outputTeams[j], this.outputTeams[i]];
        }
        this.selectedOutput = [];
        this.renderOutputList();
        App.showToast('シャッフルしました', 'success');
    },

    /**
     * 出力リストをクリア
     */
    clearOutput: function () {
        this.outputTeams = [];
        this.selectedOutput = [];
        this.renderOutputList();
    },

    /**
     * 出力リストを反転
     */
    reverseOutput: function () {
        this.outputTeams.reverse();
        this.selectedOutput = [];
        this.renderOutputList();
    },

    /**
     * CHEファイルとして保存
     */
    saveCHE: function () {
        if (this.outputTeams.length < 2 || this.outputTeams.length > 16) {
            App.showToast('チーム数は2〜16の間で指定してください', 'error');
            return;
        }

        // 保存形式を取得
        const format = document.getElementById('save-format').value;
        // 大会名を取得
        const tournamentName = document.getElementById('tournament-name').value || '新規大会';

        // チームデータ連結形式の場合は rawBuffer が必須
        // マッチデータ形式の場合は再生成可能なのでチェックを緩和
        if (format === 'team') {
            const teamsWithBuffer = this.outputTeams.filter(t => t.rawBuffer);
            if (teamsWithBuffer.length !== this.outputTeams.length) {
                App.showToast('マッチデータ由来のチームはチーム連結形式で保存できません', 'error');
                return;
            }
        }

        try {
            let buffer;
            let filename;

            if (format === 'match') {
                // マッチデータ形式（CEMD）
                // 注: 勝敗データは保存しない（ユーザー要望）
                buffer = CHEParser.generateMatchFile(this.outputTeams, tournamentName);
                filename = 'match_output.CHE';
            } else {
                // チームデータ連結形式
                buffer = CHEParser.generateTeamFile(this.outputTeams);
                filename = 'team_output.CHE';
            }

            // ダウンロード（file://プロトコル対応）
            this.downloadFile(buffer, filename);

            App.showToast(`${filename} を保存しました`, 'success');
        } catch (e) {
            console.error('Save error:', e);
            App.showToast('保存中にエラーが発生しました: ' + e.message, 'error');
        }
    },

    /**
     * ファイルダウンロード処理
     */
    downloadFile: function (buffer, filename) {
        const blob = new Blob([buffer], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;

        // DOMに追加してクリック
        document.body.appendChild(a);
        a.click();

        // クリーンアップ
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    },

    /**
     * リセット
     */
    reset: function () {
        this.sourceTeams = [];
        this.outputTeams = [];
        this.selectedSource = [];
        this.selectedOutput = [];
        this.rawBuffers = [];
        this.renderSourceList();
        this.renderOutputList();
    },

    /**
     * ドラッグ&ドロップの設定
     */
    setupDragAndDrop: function (listId, arrayName) {
        const list = document.getElementById(listId);
        let draggedItem = null;
        let draggedIndex = null;

        list.addEventListener('dragstart', (e) => {
            if (e.target.tagName !== 'LI') return;
            draggedItem = e.target;
            draggedIndex = parseInt(e.target.dataset.index);
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        list.addEventListener('dragend', (e) => {
            if (e.target.tagName !== 'LI') return;
            e.target.classList.remove('dragging');
            // ドロップ先インジケータを消す
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            draggedItem = null;
            draggedIndex = null;
        });

        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const target = e.target.closest('li');
            if (!target || target === draggedItem) return;

            // 他の要素のハイライトを消す
            list.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            target.classList.add('drag-over');
        });

        list.addEventListener('dragleave', (e) => {
            const target = e.target.closest('li');
            if (target) {
                target.classList.remove('drag-over');
            }
        });

        list.addEventListener('drop', (e) => {
            e.preventDefault();
            const target = e.target.closest('li');
            if (!target || target === draggedItem) return;

            const targetIndex = parseInt(target.dataset.index);
            const array = this[arrayName];

            // 配列内の要素を移動
            const [movedItem] = array.splice(draggedIndex, 1);
            array.splice(targetIndex, 0, movedItem);

            // 選択状態をクリア
            if (arrayName === 'sourceTeams') {
                this.selectedSource = [];
                this.renderSourceList();
            } else {
                this.selectedOutput = [];
                this.renderOutputList();
            }
        });
    }
};

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TeamEditor;
}
