const fs = require('fs');
let html = fs.readFileSync('c:/Users/ba/OneDrive/桌面/exam/docs/index.html', 'utf8');

// Update JS variable `canvas` and `zoomLayer` references
html = html.replace(/const canvas = document.getElementById\('tree-canvas'\);/, "const canvas = document.getElementById('habit-canvas');");
html = html.replace(/const zoomLayer = document.getElementById\('tree-zoom-layer'\);/, "const zoomLayer = document.getElementById('habit-zoom-layer');");

// Let's replace the whole block from "let humanTree = { name: "human", children: [] };"
// to the end of "saveAction() {}"

const newBlock = `
        let habitGraph = { nodes: [], edges: [] };
        let currentNodeId = null, currentTokens = [], draggedTokenId = null;
        let hasInitialized = false;

        function generateId() { return Math.random().toString(36).substr(2, 9); }

        function switchView(viewId) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            if (viewId === 'view-tree' || viewId === 'view-file-settings') { document.body.style.overflow = 'hidden'; }
            else { document.body.style.overflow = 'auto'; }
            if (viewId === 'view-file-settings' && typeof initFileSettings === 'function') initFileSettings();
        }

        function initApp() {
            if (!hasInitialized) switchView('view-welcome');
            else {
                renderHabitCanvas();
                switchView('view-tree');
                resetCanvasView();
                checkDailySleepPrompt();
            }
            handleTosUI();
        }

        function initFirstAction() {
            if (!getTosAccepted()) return showToast("⚠️ 請先勾選同意隱私權政策與服務條款！", "error");
            let demandInput = document.getElementById('init-demand').value.trim();
            let actionInput = document.getElementById('init-action').value.trim();
            if (!demandInput || !actionInput) return showToast("請完整填寫需求與行動！", "error");

            habitGraph = { nodes: [], edges: [] };
            let cueId = generateId();
            let resId = generateId();
            
            habitGraph.nodes.push({ id: cueId, text: demandInput, stage: 'cue', x: 0, y: 0, tokens: [], st: 0, lt: 0, cp: 0, isNew: true });
            habitGraph.nodes.push({ id: resId, text: actionInput, stage: 'response', x: 0, y: 0, tokens: [], st: 0, lt: 0, cp: 0, isNew: true });
            habitGraph.edges.push({ id: generateId(), from: cueId, to: resId });

            hasInitialized = true;
            document.getElementById('btn-back-tree').style.display = 'none';
            openEditor(resId);
        }

        // =========================================================================
        // Habit Loop Canvas Rendering & Interaction
        // =========================================================================
        function renderHabitCanvas() {
            const stages = ['cue', 'craving', 'response', 'reward'];
            stages.forEach(stage => {
                document.getElementById('nodes-' + stage).innerHTML = '';
            });

            habitGraph.nodes.forEach(node => {
                let el = document.createElement('div');
                el.className = 'habit-node';
                el.id = 'node_' + node.id;
                
                // Add dragging
                el.onmousedown = (e) => {
                    if (e.target.closest('.node-delete-x') || e.target.closest('.edge-drag-handle')) return;
                    // If simply clicked, open editor, if dragged, don't open immediately
                    let isDrag = false;
                    let startX = e.clientX, startY = e.clientY;
                    let onMove = (ev) => {
                        if (Math.abs(ev.clientX - startX) > 5 || Math.abs(ev.clientY - startY) > 5) isDrag = true;
                    };
                    let onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                        if (!isDrag) openEditor(node.id);
                    };
                    window.addEventListener('mousemove', onMove);
                    window.addEventListener('mouseup', onUp);
                };

                let cpColor = typeof node.cp === 'number' && node.cp >= 0 ? 'var(--good)' : 'var(--bad)';
                let cpStr = (typeof node.cp === 'number') ? \`<div style="font-size:0.85rem; color:\${cpColor}; font-weight:bold; margin-top:5px;">CP: \${node.cp.toFixed(2)}</div>\` : '';
                
                el.innerHTML = \`<span class="node-delete-x" onclick="deleteHabitNode('\${node.id}', event)">✕</span>
                                <div class="node-content-text">\${node.text}</div>\${cpStr}
                                <div class="edge-drag-handle" onmousedown="startEdgeDrag('\${node.id}', event)"></div>\`;
                
                let container = document.getElementById('nodes-' + node.stage);
                if(container) container.appendChild(el);
            });

            requestAnimationFrame(drawEdges);
        }

        async function addHabitNode(stage, text) {
            if (!text) {
                text = await showModal({
                    title: '➕ 新增節點',
                    message: '請輸入節點名稱',
                    inputPlaceholder: '例如：滑手機...',
                    confirmText: '新增',
                });
            }
            if (text && text.trim()) {
                const newId = generateId();
                habitGraph.nodes.push({ id: newId, text: text.trim(), stage: stage, x: 0, y: 0, tokens: [], st: 0, lt: 0, cp: 0, isNew: true });
                renderHabitCanvas();
                syncToDrive('addHabitNode');
            }
        }

        async function deleteHabitNode(nodeId, event) {
            if (event) event.stopPropagation();
            let node = habitGraph.nodes.find(n => n.id === nodeId);
            if(!node) return;
            const ok = await showModal({
                title: '🗑️ 刪除節點',
                message: \`確定要刪除「<strong>\${node.text}</strong>」嗎？\`,
                confirmText: '刪除',
                danger: true,
            });
            if (ok) {
                habitGraph.nodes = habitGraph.nodes.filter(n => n.id !== nodeId);
                habitGraph.edges = habitGraph.edges.filter(e => e.from !== nodeId && e.to !== nodeId);
                renderHabitCanvas();
                showToast('節點已刪除', 'success');
                syncToDrive('deleteHabitNode');
            }
        }

        let isEdgeDragging = false;
        let edgeDragFromId = null;
        let movingEdgeLine = null;

        function startEdgeDrag(nodeId, event) {
            event.stopPropagation();
            event.preventDefault();
            isEdgeDragging = true;
            edgeDragFromId = nodeId;
            
            const svg = document.getElementById('habit-edge-svg');
            movingEdgeLine = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            movingEdgeLine.setAttribute('class', 'habit-edge-path');
            movingEdgeLine.style.strokeDasharray = "5,5";
            svg.appendChild(movingEdgeLine);

            const updateMovingEdge = (e) => {
                if(!isEdgeDragging) return;
                const fromEl = document.getElementById('node_' + edgeDragFromId);
                const svgRect = svg.getBoundingClientRect();
                
                if(!fromEl) return;
                const fromRect = fromEl.getBoundingClientRect();
                const fromHandle = fromEl.querySelector('.edge-drag-handle');
                const handleRect = fromHandle ? fromHandle.getBoundingClientRect() : fromRect;

                const startX = (handleRect.left + handleRect.width/2 - svgRect.left) / scale;
                const startY = (handleRect.top + handleRect.height/2 - svgRect.top) / scale;
                
                const currentX = (e.clientX - svgRect.left) / scale;
                const currentY = (e.clientY - svgRect.top) / scale;

                const d = \`M \${startX} \${startY} Q \${startX + (currentX-startX)/2} \${startY}, \${currentX} \${currentY}\`;
                movingEdgeLine.setAttribute('d', d);
            };

            const endEdgeDrag = (e) => {
                window.removeEventListener('mousemove', updateMovingEdge);
                window.removeEventListener('mouseup', endEdgeDrag);
                if(movingEdgeLine) { movingEdgeLine.remove(); movingEdgeLine = null; }
                isEdgeDragging = false;

                // Find if dropped on another node
                const elements = document.elementsFromPoint(e.clientX, e.clientY);
                const targetNodeEl = elements.find(el => el.classList && el.classList.contains('habit-node'));
                if (targetNodeEl) {
                    const toId = targetNodeEl.id.replace('node_', '');
                    if (toId !== edgeDragFromId) {
                        // Check if edge already exists
                        const exists = habitGraph.edges.find(edge => edge.from === edgeDragFromId && edge.to === toId);
                        if(!exists) {
                            habitGraph.edges.push({ id: generateId(), from: edgeDragFromId, to: toId });
                            renderHabitCanvas();
                            syncToDrive('addEdge');
                        }
                    }
                }
                edgeDragFromId = null;
            };

            window.addEventListener('mousemove', updateMovingEdge);
            window.addEventListener('mouseup', endEdgeDrag);
        }

        async function deleteHabitEdge(edgeId, event) {
            if(event) event.stopPropagation();
            const ok = await showModal({
                title: '🗑️ 刪除連結',
                message: \`確定要刪除這條連結嗎？\`,
                confirmText: '刪除',
                danger: true,
            });
            if(ok) {
                habitGraph.edges = habitGraph.edges.filter(e => e.id !== edgeId);
                renderHabitCanvas();
                syncToDrive('deleteEdge');
            }
        }

        function drawEdges() {
            const svg = document.getElementById('habit-edge-svg');
            if(!svg) return;
            svg.innerHTML = ''; // clear
            
            // Add marker definition for arrows
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            defs.innerHTML = \`<marker id="arrowhead" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--line-color)" />
            </marker>
            <marker id="arrowhead-hover" markerWidth="10" markerHeight="7" 
                refX="9" refY="3.5" orient="auto">
                <polygon points="0 0, 10 3.5, 0 7" fill="var(--bad)" />
            </marker>\`;
            svg.appendChild(defs);

            const svgRect = svg.getBoundingClientRect();
            
            habitGraph.edges.forEach(edge => {
                const fromEl = document.getElementById('node_' + edge.from);
                const toEl = document.getElementById('node_' + edge.to);
                if(!fromEl || !toEl) return;

                const fromHandle = fromEl.querySelector('.edge-drag-handle');
                const fromRect = fromHandle ? fromHandle.getBoundingClientRect() : fromEl.getBoundingClientRect();
                const toRect = toEl.getBoundingClientRect();

                const startX = (fromRect.left + fromRect.width/2 - svgRect.left) / scale;
                const startY = (fromRect.top + fromRect.height/2 - svgRect.top) / scale;
                
                // Connect to left side of target node
                const endX = (toRect.left - svgRect.left) / scale;
                const endY = (toRect.top + toRect.height/2 - svgRect.top) / scale;

                const dx = endX - startX;
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('class', 'habit-edge-path');
                // Use a beizer curve
                const d = \`M \${startX} \${startY} C \${startX + Math.max(100, dx/2)} \${startY}, \${endX - Math.max(50, dx/2)} \${endY}, \${endX} \${endY}\`;
                path.setAttribute('d', d);
                path.setAttribute('marker-end', 'url(#arrowhead)');
                
                path.onmouseover = () => path.setAttribute('marker-end', 'url(#arrowhead-hover)');
                path.onmouseout = () => path.setAttribute('marker-end', 'url(#arrowhead)');
                path.onclick = (e) => deleteHabitEdge(edge.id, e);
                
                svg.appendChild(path);
            });
        }

        // Handle window resize or scroll to redraw arrows
        window.addEventListener('resize', () => { if(document.getElementById('view-tree').classList.contains('active')) requestAnimationFrame(drawEdges); });

        // =========================================================================
        // View 2: 四階段編輯器 Editor logic
        // =========================================================================
        function openEditor(nodeId) {
            currentNodeId = nodeId; currentTokens = [];
            document.getElementById('alert-box').style.display = 'none';
            if (hasInitialized) document.getElementById('btn-back-tree').style.display = 'inline-block';

            ['zone-cue', 'zone-craving', 'zone-response', 'zone-reward', 'token-dock'].forEach(id => {
                const el = document.getElementById(id);
                if(el) Array.from(el.children).forEach(c => { if (c.classList.contains('cp-token')) c.remove(); });
            });
            checkDockHint();

            if (nodeId !== null) {
                let node = habitGraph.nodes.find(n => n.id === nodeId);
                document.getElementById('editor-title').innerText = \`編輯節點：\${node.text}\`;
                document.getElementById('action-name').value = node.text;
                currentTokens = JSON.parse(JSON.stringify(node.tokens || []));
                currentTokens.forEach(t => renderToken(t));
            }
            updateScores();
            switchView('view-editor');
        }

        function goToTree() { initApp(); }

        function toggleScoreSign() {
            const input = document.getElementById('cp-score');
            const val = input.value.trim();
            if (!val) {
                input.value = '-';
                input.focus();
                return;
            }
            if (val.startsWith('-')) input.value = val.substring(1);
            else input.value = '-' + val;
        }

        function createCPToken() {
            let nameInput = document.getElementById('cp-name').value.trim();
            let scoreInput = parseFloat(document.getElementById('cp-score').value);
            if (!nameInput || isNaN(scoreInput)) return showToast("請填寫完整的名稱與分數！", "error");

            let newToken = { id: 'token_' + generateId(), name: nameInput, score: scoreInput, timeType: document.getElementById('cp-time').value, stage: 'dock' };
            currentTokens.push(newToken);
            renderToken(newToken);

            document.getElementById('cp-name').value = ''; document.getElementById('cp-score').value = '';
            updateScores();
        }

        function renderToken(token) {
            let el = document.createElement('div');
            el.className = \`cp-token \${token.timeType === 'st' ? 'st-token' : 'lt-token'}\`;
            el.id = token.id; el.draggable = true;
            el.innerHTML = \`<span>\${token.name} (\${token.score > 0 ? '+' + token.score : token.score})</span><span class="token-del" onclick="deleteToken('\${token.id}')">✖</span>\`;

            el.addEventListener('dragstart', () => { draggedTokenId = token.id; setTimeout(() => el.style.opacity = '0.5', 0); });
            el.addEventListener('dragend', () => el.style.opacity = '1');

            el.addEventListener('touchstart', (e) => {
                if (e.touches.length > 1) return;
                draggedTokenId = token.id;
                el.style.opacity = '0.5';
                el._touchStartX = e.touches[0].clientX;
                el._touchStartY = e.touches[0].clientY;
            }, { passive: true });
            el.addEventListener('touchend', (e) => {
                if (draggedTokenId === token.id) {
                    el.style.opacity = '1';
                    const touch = e.changedTouches[0];
                    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
                    const dropZone = targetEl ? targetEl.closest('.drop-zone') : null;
                    if (dropZone) {
                        const zoneId = dropZone.id.replace('zone-', '');
                        drop({ preventDefault: () => { } }, zoneId === 'token-dock' ? 'dock' : zoneId);
                    }
                    draggedTokenId = null;
                }
            });

            const zone = document.getElementById(token.stage === 'dock' ? 'token-dock' : \`zone-\${token.stage}\`);
            if(zone) zone.appendChild(el);
            checkDockHint();
        }

        function deleteToken(tokenId) {
            currentTokens = currentTokens.filter(t => t.id !== tokenId);
            const el = document.getElementById(tokenId);
            if(el) el.remove();
            updateScores();
            checkDockHint();
        }

        function checkDockHint() {
            let dock = document.getElementById('token-dock');
            let hint = document.getElementById('dock-hint-text');
            if(dock && hint) {
                if (dock.querySelectorAll('.cp-token').length > 0) hint.style.display = 'none';
                else hint.style.display = 'block';
            }
        }

        function allowDrop(ev) { ev.preventDefault(); }
        function dragEnter(ev) { ev.currentTarget.classList.add('dragover'); }
        function dragLeave(ev) { ev.currentTarget.classList.remove('dragover'); }

        function drop(ev, targetStage) {
            ev.preventDefault(); 
            if(ev.currentTarget.classList) ev.currentTarget.classList.remove('dragover');
            if (draggedTokenId !== null) {
                const dropEl = document.getElementById(draggedTokenId);
                if(ev.currentTarget && ev.currentTarget.appendChild && dropEl) ev.currentTarget.appendChild(dropEl);
                let tokenData = currentTokens.find(t => t.id === draggedTokenId);
                if (tokenData) tokenData.stage = targetStage;
                draggedTokenId = null;
                checkDockHint();
            }
        }

        function updateScores() {
            let stSum = currentTokens.filter(t => t.timeType === 'st').reduce((sum, t) => sum + t.score, 0);
            let ltSum = currentTokens.filter(t => t.timeType === 'lt').reduce((sum, t) => sum + t.score, 0);
            let finalCp = stSum + (ltSum * ltMultiplier);

            const stEl = document.getElementById('score-st');
            const ltEl = document.getElementById('score-lt');
            const cpEl = document.getElementById('score-final');
            if(stEl) stEl.innerText = stSum;
            if(ltEl) ltEl.innerText = ltSum;
            if(cpEl) cpEl.innerText = finalCp.toFixed(2);
            return { st: stSum, lt: ltSum, final: finalCp };
        }

        function saveAction() {
            let actionNameInput = document.getElementById('action-name').value.trim();
            if (!actionNameInput) return showToast("請填寫行動名稱！", "error");

            let scores = updateScores();
            let alertBox = document.getElementById('alert-box');
            let isGoodHabit = (scores.lt >= 0);

            let node = habitGraph.nodes.find(n => n.id === currentNodeId);
            if(!node) return;
            let isNewAction = node.isNew;

            if (!isNewAction) {
                if (isGoodHabit && scores.st <= 0) {
                    alertBox.className = 'alert-box';
                    alertBox.innerHTML = \`🚨【系統防護攔截】這是一個「好習慣 (長期 >= 0)」！<br>
                你的短期 CP 目前是 \${scores.st}。<br>
                大腦是短視的，如果短期痛苦沒有獎勵，大腦就會放棄！<br>
                👉 <b>請強制加入「短期的正面 CP (獎賞)」，讓短期 CP > 0！</b>\`;
                    alertBox.style.display = 'block';
                    return;
                } else if (!isGoodHabit && scores.st >= 0) {
                    alertBox.className = 'alert-box';
                    alertBox.innerHTML = \`🚨【系統防護攔截】這是一個「壞習慣 (長期 < 0)」！<br>
                你的短期 CP 目前是 \${scores.st}。<br>
                只要短期 CP 還是正的，你的大腦就會覺得性價比很高而繼續做！<br>
                👉 <b>請強制加入「短期的負面 CP (摩擦力/懲罰)」，讓短期 CP < 0！</b>\`;
                    alertBox.style.display = 'block';
                    return;
                }
            } else {
                if (isGoodHabit && scores.st <= 0) {
                    showToast("【系統提示】你正在建立好習慣，但短期 CP 尚未大於 0。大腦很容易放棄喔！(下次編輯將強制修正)", "warning");
                } else if (!isGoodHabit && scores.st >= 0) {
                    showToast("【系統提示】你正在紀錄壞習慣，但短期 CP 還是正的。大腦還是會繼續這個迴路！(下次編輯將強制修正)", "warning");
                }
            }

            if(alertBox) alertBox.style.display = 'none';

            node.text = actionNameInput; node.st = scores.st; node.lt = scores.lt;
            node.cp = scores.final; node.tokens = currentTokens; node.isNew = false;

            showToast("已成功寫入大腦決策網路！", "success");
            syncToDrive('saveAction');
            initApp();
        }
`;

const regex1 = /let humanTree = \{ name: "human", children: \[\] \};[\s\S]*?function saveAction\(\) \{[\s\S]*?initApp\(\);\s*\}/;
html = html.replace(regex1, newBlock.trim());

// Update initFileSettings and view switch
html = html.replace(/function initApp\(\) \{/, `function toggleSeparateFolders() {
            const checked = document.getElementById('setting-separate-folders').checked;
            localStorage.setItem('brain_separate_folders', checked ? 'true' : 'false');
            document.getElementById('btn-save-folder').disabled = !checked;
            document.getElementById('display-save-folder').innerText = checked ? (localStorage.getItem('brain_save_folder_name') || '未選擇設定') : '與載入來源相同';
        }

        function initFileSettings() {
            const sep = localStorage.getItem('brain_separate_folders') === 'true';
            document.getElementById('setting-separate-folders').checked = sep;
            document.getElementById('btn-save-folder').disabled = !sep;
            
            const loadName = localStorage.getItem('brain_load_folder_name') || '根目錄 (My Drive)';
            const saveName = localStorage.getItem('brain_save_folder_name') || '未選擇設定';

            document.getElementById('display-load-folder').innerText = loadName;
            document.getElementById('display-save-folder').innerText = sep ? saveName : '與載入來源相同';
            
            const statusEl = document.getElementById('setting-file-status');
            if (currentUser) {
                statusEl.innerText = '✅ 您已連線至 Google Drive';
                statusEl.style.color = 'var(--good)';
            } else {
                statusEl.innerText = '⚠️ 請先登入 Google 帳號以使用自動化設定';
                statusEl.style.color = 'var(--craving)';
            }
        }\n\n        function initApp() {`);

// Also need to patch `serializeTreeForSync` and `restoreTreeFromSerialized`
html = html.replace(/function serializeTreeForSync\(\) \{[\s\S]*?return \{\s*name: humanTree\.name[\s\S]*?\}\)\),\s*\};\s*\}/, `function serializeTreeForSync() {
            return habitGraph;
        }`);

html = html.replace(/function restoreTreeFromSerialized\(saved\) \{[\s\S]*?hasInitialized = true;\s*return true;\s*\}/, `function restoreTreeFromSerialized(saved) {
            if (!saved || !saved.nodes) return false;
            habitGraph = { nodes: saved.nodes || [], edges: saved.edges || [] };
            hasInitialized = true;
            return true;
        }`);

// Also update `saveToLocal` to serialize habitGraph
html = html.replace(/humanTree: serializeTreeForSync\(\)/, "habitGraph: serializeTreeForSync()");
// And `loadFromLocal` to return `data.habitGraph`
html = html.replace(/if \(data && data\.humanTree\) return data\.humanTree;/, "if (data && data.habitGraph) return data.habitGraph;");
// Conflict Preview HTML
html = html.replace(/function treePreviewHTML\(tree\) \{[\s\S]*?return html;\s*\}/, `function treePreviewHTML(graph) {
            if (!graph || !graph.nodes || graph.nodes.length === 0) return '<div style="color:#999;">（無資料）</div>';
            let html = '';
            graph.nodes.forEach(n => {
                const cp = typeof n.cp === 'number' ? n.cp.toFixed(2) : '?';
                html += \`<div class="action-item">[\${n.stage.toUpperCase()}] \${n.text} (CP: \${cp})</div>\`;
            });
            return html;
        }`);
// Patch drive picker to support load vs save
html = html.replace(/async function openDrivePicker\(\) \{/, "async function openDrivePicker(modeStr = 'load') {");
html = html.replace(/let selectedFolderId = data\.currentFolderId \|\| null;/g, `let selectedFolderId = null;
                if (modeStr === 'load') selectedFolderId = localStorage.getItem('brain_load_folder_id') || data.currentFolderId || null;
                else selectedFolderId = localStorage.getItem('brain_save_folder_id') || data.currentFolderId || null;`);

html = html.replace(/currentUser\.driveFolderName = createData\.folderName \|\| null;\s*currentUser\.driveFolderId = createData\.folderId \|\| null;/, `
                            if (modeStr === 'load') {
                                localStorage.setItem('brain_load_folder_name', createData.folderName || '根目錄');
                                localStorage.setItem('brain_load_folder_id', createData.folderId || '');
                                currentUser.driveFolderName = createData.folderName || null;
                                currentUser.driveFolderId = createData.folderId || null;
                            } else {
                                localStorage.setItem('brain_save_folder_name', createData.folderName || '根目錄');
                                localStorage.setItem('brain_save_folder_id', createData.folderId || '');
                            }
                            if(typeof initFileSettings === 'function') initFileSettings();
`);

fs.writeFileSync('c:/Users/ba/OneDrive/桌面/exam/docs/index.html', html);
console.log('JS patched successfully.');
