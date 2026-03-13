const fs = require('fs');
let html = fs.readFileSync('c:/Users/ba/OneDrive/桌面/exam/docs/index.html', 'utf8');

// 1. Replace CSS for View 1
html = html.replace(/\/\* ================= View 1: 無邊界畫布樹狀圖 \(Infinite Canvas\) ================= \*\/[\s\S]*?ul\.tree ul li:first\-child:last\-child::after \{\s*display: none;\s*\}/, `/* ================= View 1: 習慣迴圈畫布 (Habit Loop Canvas) ================= */
        .habit-canvas-container {
            width: 100vw;
            height: 100vh;
            overflow: hidden;
            background: radial-gradient(circle, #EAECEE 2px, transparent 2px);
            background-size: 30px 30px;
            background-color: var(--bg-color);
            position: fixed;
            top: 0;
            left: 0;
            cursor: grab;
            z-index: 1;
            touch-action: none;
        }

        .habit-canvas-container:active {
            cursor: grabbing;
        }

        .habit-zoom-layer {
            position: absolute;
            top: 0;
            left: 0;
            transform-origin: 0 0;
            will-change: transform;
            padding: 100px;
            display: flex;
            gap: 40px;
            min-height: 100vh;
        }

        .habit-column {
            width: 280px;
            display: flex;
            flex-direction: column;
            gap: 20px;
            position: relative;
            z-index: 2;
        }

        .habit-column-header {
            font-size: 1.2rem;
            font-weight: bold;
            text-align: center;
            padding: 15px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
            border-top: 6px solid;
            position: sticky;
            top: 20px;
            z-index: 5;
        }

        #col-cue .habit-column-header { border-color: var(--cue); color: var(--cue); }
        #col-craving .habit-column-header { border-color: var(--craving); color: var(--craving); }
        #col-response .habit-column-header { border-color: var(--response); color: var(--response); }
        #col-reward .habit-column-header { border-color: var(--reward); color: var(--reward); }

        .habit-node {
            background: white;
            border: 2px solid #ddd;
            border-radius: 12px;
            padding: 15px 20px;
            min-width: 180px;
            text-align: left;
            position: relative;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
            transition: all 0.2s ease;
            cursor: grab;
            z-index: 2;
        }

        .habit-node:active { cursor: grabbing; }

        .habit-node:hover {
            transform: scale(1.02);
            box-shadow: 0 6px 15px rgba(0, 0, 0, 0.1);
            border-color: #bbb;
        }

        #col-cue .habit-node { border-left: 6px solid var(--cue); }
        #col-craving .habit-node { border-left: 6px solid var(--craving); }
        #col-response .habit-node { border-left: 6px solid var(--response); }
        #col-reward .habit-node { border-left: 6px solid var(--reward); }

        .habit-node-add {
            border: 2px dashed #bbb;
            color: #888;
            background: rgba(255,255,255,0.5);
            font-weight: bold;
            padding: 15px;
            border-radius: 12px;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s;
        }

        .habit-node-add:hover {
            background: white;
            border-color: var(--st-color);
            color: var(--st-color);
        }

        .node-delete-x {
            position: absolute;
            top: -8px;
            right: -8px;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: var(--bad);
            color: white;
            font-size: 14px;
            line-height: 22px;
            text-align: center;
            cursor: pointer;
            opacity: 0;
            transition: opacity 0.2s;
            z-index: 5;
            font-weight: bold;
        }

        .habit-node:hover > .node-delete-x {
            opacity: 1;
        }

        .node-content-text {
            word-wrap: break-word;
            font-size: 1rem;
            line-height: 1.4;
        }

        /* Edge SVG */
        .habit-edge-svg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 1;
            overflow: visible;
        }

        .habit-edge-path {
            fill: none;
            stroke: var(--line-color);
            stroke-width: 3px;
            stroke-linecap: round;
            pointer-events: stroke;
            cursor: pointer;
            transition: stroke 0.2s;
        }

        .habit-edge-path:hover {
            stroke: var(--bad);
            stroke-width: 5px;
        }

        .edge-drag-handle {
            position: absolute;
            right: -12px;
            top: 50%;
            transform: translateY(-50%);
            width: 24px;
            height: 24px;
            background: #fff;
            border: 2px solid #ccc;
            border-radius: 50%;
            cursor: crosshair;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            color: #999;
            opacity: 0;
            transition: opacity 0.2s;
        }

        .edge-drag-handle::after { content: "➔"; }

        .habit-node:hover > .edge-drag-handle {
            opacity: 1;
            border-color: var(--st-color);
            color: var(--st-color);
        }
        
        /* 檔案設定特有樣式 */
        .file-pipeline {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 15px;
            margin: 30px 0;
            padding: 20px;
            background: #f8f9fa;
            border-radius: 12px;
            border: 1px solid #eee;
        }
        .file-pipeline-node {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            flex: 1;
        }
        .file-pipeline-arrow {
            color: #bbb;
            font-size: 1.5rem;
            font-weight: bold;
        }
        .folder-display {
            font-size: 0.85rem;
            color: #666;
            background: white;
            padding: 5px 10px;
            border-radius: 5px;
            border: 1px solid #ddd;
            width: 100%;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .toggle-switch-wrapper {
            display: flex;
            align-items: center;
            gap: 10px;
            justify-content: center;
            margin-bottom: 20px;
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 16px; width: 16px;
            left: 4px; bottom: 4px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .toggle-slider { background-color: var(--good); }
        input:checked + .toggle-slider:before { transform: translateX(26px); }`);

// 2. Replace View 1 HTML
html = html.replace(/<div class="canvas-ui-layer">[\s\S]*?<!-- Javascript 動態渲染 Real Tree -->\s*<\/div>\s*<\/div>\s*<\/div>/, `<!-- 無邊界畫布容器 -->
        <div class="habit-canvas-container" id="habit-canvas">
            <svg class="habit-edge-svg" id="habit-edge-svg"></svg>
            <div class="habit-zoom-layer" id="habit-zoom-layer">
                <div class="habit-column" id="col-cue">
                    <div class="habit-column-header">1. 提示 (Cue) 🎯</div>
                    <div id="nodes-cue"></div>
                    <div class="habit-node-add" onclick="addHabitNode('cue')">➕ 新增提示</div>
                </div>
                <div class="habit-column" id="col-craving">
                    <div class="habit-column-header">2. 渴望 (Craving) 🤤</div>
                    <div id="nodes-craving"></div>
                    <div class="habit-node-add" onclick="addHabitNode('craving')">➕ 新增渴望</div>
                </div>
                <div class="habit-column" id="col-response">
                    <div class="habit-column-header">3. 回應 (Response) ⚡</div>
                    <div id="nodes-response"></div>
                    <div class="habit-node-add" onclick="addHabitNode('response')">➕ 新增回應</div>
                </div>
                <div class="habit-column" id="col-reward">
                    <div class="habit-column-header">4. 獎賞 (Reward) 🎁</div>
                    <div id="nodes-reward"></div>
                    <div class="habit-node-add" onclick="addHabitNode('reward')">➕ 新增獎賞</div>
                </div>
            </div>
        </div>`);

// 3. Add view-file-settings HTML after view-editor
html = html.replace(/<div id="view-editor" class="view">[\s\S]*?<\/div>\s*<\/div>/, `$&
    <!-- ================= View 3: 檔案自動化設定 ================= -->
    <div id="view-file-settings" class="view">
        <div class="container" style="max-width: 800px;">
            <div class="editor-header">
                <button onclick="goToTree()" style="background: var(--cue); margin-bottom: 20px;">⬅️ 返回畫布</button>
                <h2>📁 檔案自動化設定</h2>
                <p style="text-align:center; color:#666;">設定 Google Drive 檔案的載入與儲存路徑</p>
                
                <div class="toggle-switch-wrapper">
                    <label class="toggle-switch">
                        <input type="checkbox" id="setting-separate-folders" onchange="toggleSeparateFolders()">
                        <span class="toggle-slider"></span>
                    </label>
                    <span style="font-weight:bold;">自動載入與儲存可以不同資料夾</span>
                </div>

                <div class="file-pipeline">
                    <div class="file-pipeline-node">
                        <strong>⬇️ 載入來源</strong>
                        <button class="primary" onclick="openDrivePicker('load')">📂 選擇載入資料夾</button>
                        <div class="folder-display" id="display-load-folder">目前為根目錄</div>
                    </div>
                    <div class="file-pipeline-arrow">➔</div>
                    <div class="file-pipeline-node" style="flex:0.5; font-size:2rem;">🌐 Web</div>
                    <div class="file-pipeline-arrow">➔</div>
                    <div class="file-pipeline-node">
                        <strong>⬆️ 儲存目標</strong>
                        <button class="btn-drive" id="btn-save-folder" onclick="openDrivePicker('save')" disabled>📂 選擇儲存資料夾</button>
                        <div class="folder-display" id="display-save-folder">與載入來源相同</div>
                    </div>
                </div>
                
                <p style="font-size:0.9rem; color:#888; text-align:center;">
                    💡 若選擇不同資料夾，系統啟動時會從「載入來源」讀取資料，並且存檔/同步時會將資料寫入「儲存目標」。
                </p>
                
                <div id="setting-file-status" style="margin-top: 20px; text-align: center; font-weight: bold; color: var(--st-color);"></div>
            </div>
        </div>
    </div>`);

// 4. Update MoreDropdown
html = html.replace(/html \+= '<div class="more-dropdown-divider"><\/div>';\s*html \+= '<div class="more-dropdown-header">儲存路徑<\/div>';[\s\S]*?}<\s*\/\/ Legal links/m, `html += '<div class="more-dropdown-divider"></div>';
            html += '<div class="more-dropdown-header">檔案自動化設定</div>';
            html += \`<button class="more-dropdown-item" onclick="switchView('view-file-settings'); closeAllDropdowns();">
                <span class="item-icon">📁</span> 檔案自動化與路徑設定
            </button>\`;
            
            // Legal links`);

// Add 📥/💾 to file options
html = html.replace(/<span class="item-icon">💾<\/span> 匯出到本機檔案/, '<span class="item-icon">💾</span> 手動存檔 (匯出本機)');
html = html.replace(/<span class="item-icon">📂<\/span> 從本機檔案匯入/, '<span class="item-icon">📥</span> 手動匯入 (本機檔案)');

// Replace `.tree-canvas-container` and `.canvas-ui-layer` in CSS mobile responsiveness
html = html.replace(/\.canvas-ui-layer[\s\S]*?\.auth-bar \{/, `.habit-canvas-container {\n                touch-action: none;\n            }\n            .habit-zoom-layer {\n                flex-direction: column;\n                gap: 20px;\n                padding: 20px;\n            }\n            .habit-column {\n                width: 100%;\n            }\n            .auth-bar {`);
html = html.replace(/\.canvas-ui-layer h2 \{[\s\S]*?\}!important;\s*\}/, ``);

fs.writeFileSync('c:/Users/ba/OneDrive/桌面/exam/docs/index.html', html);
console.log('HTML and CSS patched successfully.');
