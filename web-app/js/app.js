/**
 * CHE Tools - メインアプリケーション
 */

const App = {
    loadedFiles: [],

    /**
     * 初期化
     */
    init: function () {
        this.initTabs();
        this.initDropZone();
        this.initModules();

        console.log('CHE Tools initialized');
    },

    /**
     * タブ初期化
     */
    initTabs: function () {
        const tabs = document.querySelectorAll('.tab-btn');
        const panels = document.querySelectorAll('.tab-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // アクティブ状態を切り替え
                tabs.forEach(t => t.classList.remove('active'));
                panels.forEach(p => p.classList.remove('active'));

                tab.classList.add('active');
                const panelId = tab.dataset.tab;
                document.getElementById(panelId).classList.add('active');

                // 集計結果タブを開いた時、データがあれば自動集計
                if (panelId === 'result-calc' && window.ResultCalc) {
                    if (window.TableViewer && TableViewer.teams && TableViewer.teams.length > 0) {
                        ResultCalc.calculate();
                    }
                }
            });
        });
    },

    /**
     * ドロップゾーン初期化
     */
    initDropZone: function () {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');

        // ドラッグ&ドロップイベント
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('drag-over');

            const files = Array.from(e.dataTransfer.files);
            this.handleFiles(files);
        });

        // ファイル選択
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            this.handleFiles(files);
            fileInput.value = ''; // リセット
        });

        // クリックでファイル選択（ラベル以外をクリックした時のみ）
        dropZone.addEventListener('click', (e) => {
            // input要素、label要素、file-btnクラスの場合は何もしない
            if (e.target.tagName === 'INPUT' ||
                e.target.tagName === 'LABEL' ||
                e.target.classList.contains('file-btn')) {
                return;
            }
            fileInput.click();
        });
    },

    /**
     * モジュール初期化
     */
    initModules: function () {
        TeamEditor.init();
        TableViewer.init();
        ResultCalc.init();
    },

    /**
     * ファイル処理
     */
    handleFiles: function (files) {
        files.forEach(file => {
            if (!file.name.toLowerCase().endsWith('.che')) {
                this.showToast(`${file.name} はCHEファイルではありません`, 'error');
                return;
            }

            this.readFile(file);
        });
    },

    /**
     * ファイル読み込み
     */
    readFile: function (file) {
        const reader = new FileReader();

        reader.onload = (e) => {
            try {
                const buffer = e.target.result;
                const data = CHEParser.parse(buffer);

                // ファイルリストに追加
                this.addLoadedFile(file.name, data.type);

                // 各モジュールにデータを渡す
                if (data.type === 'team') {
                    TeamEditor.addTeamsFromFile(data, file.name);
                    this.showToast(`${file.name} (チームデータ) を読み込みました`, 'success');
                } else if (data.type === 'match') {
                    // マッチデータ内のチームもエディタに追加
                    TeamEditor.addTeamsFromFile(data, file.name);

                    TableViewer.setMatchData(data);
                    // ResultCalcは自動的にTableViewerからデータを取得
                    this.showToast(`${file.name} (マッチデータ) を読み込みました`, 'success');
                }

            } catch (error) {
                console.error('Parse error:', error);
                this.showToast(`${file.name} の読み込みに失敗しました: ${error.message}`, 'error');
            }
        };

        reader.onerror = () => {
            this.showToast(`${file.name} の読み込みに失敗しました`, 'error');
        };

        reader.readAsArrayBuffer(file);
    },

    /**
     * 読み込み済みファイルリストに追加
     */
    addLoadedFile: function (filename, type) {
        this.loadedFiles.push({ filename, type });
        this.renderFileList();
    },

    /**
     * ファイルリスト描画
     */
    renderFileList: function () {
        const container = document.getElementById('file-list');
        const list = document.getElementById('loaded-files');

        if (this.loadedFiles.length === 0) {
            container.classList.add('hidden');
            return;
        }

        container.classList.remove('hidden');
        list.innerHTML = '';

        this.loadedFiles.forEach(file => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="file-type ${file.type}">${file.type === 'team' ? 'Team' : 'Match'}</span>
                <span>${file.filename}</span>
            `;
            list.appendChild(li);
        });
    },

    /**
     * トースト通知を表示
     */
    showToast: function (message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    },

    /**
     * 全リセット
     */
    reset: function () {
        this.loadedFiles = [];
        this.renderFileList();

        TeamEditor.reset();
        TableViewer.reset();
        ResultCalc.reset();

        this.showToast('リセットしました', 'success');
    }
};

// DOMContentLoaded時に初期化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
