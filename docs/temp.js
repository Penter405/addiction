
        // =========================================================================
        // TOS & Privacy Policy Logic
        // =========================================================================
        function getTosAccepted() {
            return localStorage.getItem('brain_tos_accepted') === 'true';
        }

        async function setTosAccepted(accepted) {
            localStorage.setItem('brain_tos_accepted', accepted ? 'true' : 'false');
            handleTosUI();

            // 如果已登入，同步到後端
            if (currentUser) {
                try {
                    const res = await fetch(API_BASE + '/api/auth/me', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify({ tosAccepted: accepted })
                    });
                    if (!res.ok) throw new Error('同步 TOS 狀態失敗');
                    showToast('✅ 已將同意狀態同步至雲端', 'success');
                } catch (err) {
                    console.error('TOS sync error:', err);
                    showToast('⚠️ 無法同步同意狀態到雲端', 'error');
                }
            }
        }

        function handleTosCheckboxChange(checked) {
            setTosAccepted(checked);
        }

        function handleTosUI() {
            const accepted = getTosAccepted();
            const overlay = document.getElementById('tos-block-overlay');
            const checkbox = document.getElementById('tos-checkbox');
            const welcomeView = document.getElementById('view-welcome');
            const isWelcomeVisible = welcomeView && welcomeView.classList.contains('active');

            if (checkbox) checkbox.checked = accepted;

            // 如果已同意，隱藏遮罩
            if (accepted) {
                overlay.classList.remove('show');
                return;
            }

            // 如果未同意：
            // 1. 如果在畫布頁面 (Tree View)，必須顯示遮罩
            // 2. 如果在 Welcome 頁面且已登入，必須顯示遮罩 (強迫確認)
            // 3. 如果在 Welcome 頁面且未登入，不顯示遮罩 (因為 Welcome 頁面自有 Checkbox，且為了不擋住登入按鈕)
            if (!isWelcomeVisible || currentUser) {
                overlay.classList.add('show');
            } else {
                overlay.classList.remove('show');
            }

            const welcomeDropdown = document.getElementById('welcome-more-dropdown');
            const treeDropdown = document.getElementById('tree-more-dropdown');
            if (welcomeDropdown && welcomeDropdown.classList.contains('show')) buildMoreDropdown('welcome-more-dropdown');
            if (treeDropdown && treeDropdown.classList.contains('show')) buildMoreDropdown('tree-more-dropdown');
        }

        // =========================================================================
        // HTML 提示系統 (取代 alert)
        // =========================================================================
        function showToast(message, type = 'warning') {
            const container = document.getElementById('toast-container');
            const toast = document.createElement('div');
            let icon = type === 'error' ? '🚨 ' : type === 'success' ? '✅ ' : '💡 ';
            toast.className = `toast ${type}`;
            toast.innerHTML = icon + message + `<span class="toast-close" onclick="this.parentElement.remove()">✕</span>`;
            container.appendChild(toast);
        }

        // Reusable modal: replaces confirm() and prompt()
        // Usage:
        //   const ok = await showModal({ title, message, confirmText, cancelText })           → returns true/false
        //   const val = await showModal({ title, message, inputPlaceholder, confirmText })    → returns string/null
        //   await showModal({ title, message, buttons: [{text, className, value}] })          → returns value
        function showModal(opts) {
            return new Promise(resolve => {
                const overlay = document.getElementById('modal-overlay');
                const titleEl = document.getElementById('modal-title');
                const msgEl = document.getElementById('modal-message');
                const inputEl = document.getElementById('modal-input');
                const actionsEl = document.getElementById('modal-actions');

                titleEl.textContent = opts.title || '';
                msgEl.innerHTML = opts.message || '';

                // Input mode
                if (opts.inputPlaceholder !== undefined) {
                    inputEl.style.display = 'block';
                    inputEl.value = opts.inputDefault || '';
                    inputEl.placeholder = opts.inputPlaceholder;
                    setTimeout(() => inputEl.focus(), 100);
                } else {
                    inputEl.style.display = 'none';
                }

                function close(val) {
                    overlay.classList.remove('show');
                    resolve(val);
                }

                // Build buttons
                let btnsHTML = '';
                if (opts.buttons) {
                    opts.buttons.forEach((b, i) => {
                        btnsHTML += `<button class="${b.className || 'modal-btn-primary'}" id="modal-btn-${i}">${b.text}</button>`;
                    });
                } else {
                    const confirmText = opts.confirmText || '確定';
                    const cancelText = opts.cancelText || '取消';
                    const confirmClass = opts.danger ? 'modal-btn-danger' : 'modal-btn-primary';
                    btnsHTML = `<button class="modal-btn-cancel" id="modal-btn-cancel">${cancelText}</button>`;
                    btnsHTML += `<button class="${confirmClass}" id="modal-btn-confirm">${confirmText}</button>`;
                }
                actionsEl.innerHTML = btnsHTML;

                // Bind events
                if (opts.buttons) {
                    opts.buttons.forEach((b, i) => {
                        document.getElementById(`modal-btn-${i}`).onclick = () => close(b.value);
                    });
                } else {
                    document.getElementById('modal-btn-cancel').onclick = () => {
                        close(opts.inputPlaceholder !== undefined ? null : false);
                    };
                    document.getElementById('modal-btn-confirm').onclick = () => {
                        close(opts.inputPlaceholder !== undefined ? inputEl.value : true);
                    };
                }

                // Enter key for input mode
                if (opts.inputPlaceholder !== undefined) {
                    inputEl.onkeydown = (e) => {
                        if (e.key === 'Enter') close(inputEl.value);
                    };
                }

                overlay.classList.add('show');
            });
        }

        // =========================================================================
        // 無邊界畫布：滑鼠縮放與平移邏輯
        // =========================================================================
        const canvas = document.getElementById('tree-canvas');
        const zoomLayer = document.getElementById('tree-zoom-layer');
        let scale = 1;
        let panX = 0, panY = 0;
        let isDragging = false;
        let startX, startY;
        let touchStartNodeBox = null;
        let touchDidPan = false;
        let touchStartClientX = 0, touchStartClientY = 0;
        let lastMouseClientY = 0;
        let isActiveNodeDragging = false;

        window.addEventListener('mousedown', (e) => {
            if (draggedNodeId) {
                const nodeBox = e.target.closest('.node-box');
                if (nodeBox && nodeBox.id === `node-${draggedNodeId}`) {
                    isActiveNodeDragging = true;
                    lastMouseClientY = e.clientY;
                    e.preventDefault(); // prevent text selection
                    return;
                }
            }
            // Fallback for canvas pan
            if (e.target.closest('#tree-render-area')) {
                isDragging = true;
                touchDidPan = false;
                touchStartNodeBox = e.target.closest('.node-box');
                startX = e.clientX - panX;
                startY = e.clientY - panY;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (isActiveNodeDragging && draggedNodeId) {
                const node = getNode(draggedNodeId);
                if (node) {
                    const dy = (e.clientY - lastMouseClientY) / scale;
                    node.yOffset = (node.yOffset || 60) + dy;
                    lastMouseClientY = e.clientY;
                    
                    const nodeEl = document.getElementById(`node-${draggedNodeId}`);
                    if (nodeEl) {
                        // Check if we hovered over a new column
                        document.elementsFromPoint(e.clientX, e.clientY).forEach(el => {
                            const colEl = el.closest('.canvas-column');
                            if (colEl) {
                                const newCol = parseInt(colEl.getAttribute('data-col'));
                                if (newCol && newCol !== node.columnId) {
                                    node.columnId = newCol;
                                    nodeEl.remove();
                                    colEl.querySelector('.nodes-container').appendChild(nodeEl);
                                }
                            }
                        });
                        
                        nodeEl.style.top = `${node.yOffset}px`;
                        drawLinks();
                    }
                }
                return;
            }

            if (!isDragging) return;
            touchDidPan = true;
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            updateCanvasTransform();
        });

        window.addEventListener('mouseup', (e) => { 
            if (isActiveNodeDragging) {
                isActiveNodeDragging = false;
                syncToDrive('dragNode');
                // Re-render to ensure DOM is clean after column jumps
                renderTree();
                return;
            }
            isDragging = false; 
        });

        // 滑鼠滾輪：對準游標縮放
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomSensitivity = 0.0015;
            const delta = -e.deltaY * zoomSensitivity;
            let newScale = scale * (1 + delta);
            newScale = Math.max(0.3, Math.min(newScale, 2.5)); // 限制縮放比例

            // 取得畫布邊界，計算滑鼠相對位置
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // 數學計算：確保縮放的中心點是滑鼠游標的位置
            panX = mouseX - (mouseX - panX) * (newScale / scale);
            panY = mouseY - (mouseY - panY) * (newScale / scale);
            scale = newScale;

            updateCanvasTransform();
        });

        // 滑鼠拖曳：平移
        canvas.addEventListener('mousedown', (e) => {
            // 如果點擊的是節點本身，則不觸發平移 (讓 click 事件生效)
            if (e.target.closest('.node-box')) return;
            isDragging = true;
            startX = e.clientX - panX;
            startY = e.clientY - panY;
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            panX = e.clientX - startX;
            panY = e.clientY - startY;
            updateCanvasTransform();
        });

        window.addEventListener('mouseup', () => { isDragging = false; });

        // --- 手機觸控支援 ---
        let lastTouchDist = 0;
        let isPinching = false;

        canvas.addEventListener('touchstart', (e) => {
            const nodeBox = e.target.closest('.node-box');
            if (e.touches.length === 1) {
                // 單點：平移（即使手指開始在節點上也允許滑動）
                touchStartNodeBox = nodeBox;
                touchDidPan = false;
                isDragging = true;
                isPinching = false;
                startX = e.touches[0].clientX - panX;
                startY = e.touches[0].clientY - panY;
                touchStartClientX = e.touches[0].clientX;
                touchStartClientY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                // 兩點：縮放
                isDragging = false;
                isPinching = true;
                touchStartNodeBox = null;
                lastTouchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        });

        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                // 如果滑動距離小於 10px，不當成平移（可能是想點擊）
                const dx = e.touches[0].clientX - touchStartClientX;
                const dy = e.touches[0].clientY - touchStartClientY;
                if (!touchDidPan && Math.sqrt(dx * dx + dy * dy) < 10) return;
                touchDidPan = true;
                panX = e.touches[0].clientX - startX;
                panY = e.touches[0].clientY - startY;
                updateCanvasTransform();
            } else if (isPinching && e.touches.length === 2) {
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                const zoomSensitivity = 0.005;
                const delta = (dist - lastTouchDist) * zoomSensitivity;
                let newScale = scale * (1 + delta);
                newScale = Math.max(0.3, Math.min(newScale, 2.5));

                // 縮放中心設為兩指中點
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = canvas.getBoundingClientRect();
                const relX = midX - rect.left;
                const relY = midY - rect.top;

                panX = relX - (relX - panX) * (newScale / scale);
                panY = relY - (relY - panY) * (newScale / scale);
                scale = newScale;
                lastTouchDist = dist;
                updateCanvasTransform();
            }
        });

        canvas.addEventListener('touchend', () => {
            // 如果手指沒有滑動超過門檻，就當成點擊
            if (isDragging && touchStartNodeBox && !touchDidPan) {
                touchStartNodeBox.click();
            }
            isDragging = false;
            isPinching = false;
            touchStartNodeBox = null;
        });
        canvas.addEventListener('touchcancel', () => {
            isDragging = false;
            isPinching = false;
            touchStartNodeBox = null;
        });

        function updateCanvasTransform() {
            zoomLayer.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
        }

        // 將視角重置置中
        function resetCanvasView() {
            scale = 1; panX = 50; panY = 100; // 預留一點上左邊距
            updateCanvasTransform();
        }

        // =========================================================================
        // 系統狀態與資料初始化 (Node-Graph Model)
        // =========================================================================
        let nodeTree = {
            nodes: [
                { id: 'root', label: 'Human Brain', desc: 'human has some base demand need to be serve, and sometime they love try something new', isRoot: true, columnId: 1, yOffset: 150, cpSt: null, cpLt: null },
                { id: 'n1', label: '提示', isRoot: false, columnId: 2, yOffset: 60, cpSt: null, cpLt: null },
                { id: 'n2', label: '渴望', isRoot: false, columnId: 3, yOffset: 60, cpSt: null, cpLt: null },
                { id: 'n3', label: '回應', isRoot: false, columnId: 4, yOffset: 60, cpSt: null, cpLt: null },
                { id: 'n4', label: '獎賞', isRoot: false, columnId: 5, yOffset: 60, cpSt: null, cpLt: null },
                { id: 'n5', label: '底層需求', isRoot: false, columnId: 6, yOffset: 60, cpSt: null, cpLt: null },
            ],
            links: [
                { from: 'root', to: 'n1' },
                { from: 'root', to: 'n2' },
                { from: 'root', to: 'n3' },
                { from: 'root', to: 'n4' },
                { from: 'root', to: 'n5' },
            ]
        };
        let humanTree = { name: "human", children: [] };
        let hasInitialized = true;

        function generateId() { return Math.random().toString(36).substr(2, 9); }
        function getNode(id) { return nodeTree.nodes.find(n => n.id === id); }
        function getChildIds(pid) { return nodeTree.links.filter(l => l.from === pid).map(l => l.to); }

        function getNodesByColumn(colId) {
            return nodeTree.nodes.filter(n => n.columnId === colId).sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        function switchView(viewId) {
            document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
            document.getElementById(viewId).classList.add('active');
            if (viewId === 'view-tree') { document.body.style.overflow = 'hidden'; }
            else { document.body.style.overflow = 'auto'; }
        }

        function initApp() {
            renderTree();
            switchView('view-tree');
            resetCanvasView();
            handleTosUI();
        }

        // =========================================================================
        // Node Operations
        // =========================================================================
        function removeNode(id, event) {
            if (event) event.stopPropagation();
            if (draggedNodeId || linkingFromNodeId) { showToast('請先完成或取消當前的動作', 'warning'); return; }
            if (!confirm('確定要刪除此節點及其所有連結嗎？')) return;
            // Remove children recursively
            const removeRec = (id) => {
                getChildIds(id).forEach(cid => {
                    nodeTree.links = nodeTree.links.filter(l => !(l.from === id && l.to === cid));
                    if (!nodeTree.links.some(l => l.to === cid)) { removeRec(cid); nodeTree.nodes = nodeTree.nodes.filter(n => n.id !== cid); }
                });
            };
            removeRec(nodeId);
            nodeTree.links = nodeTree.links.filter(l => l.from !== nodeId && l.to !== nodeId);
            nodeTree.nodes = nodeTree.nodes.filter(n => n.id !== nodeId);
            renderTree(); showToast('節點已刪除', 'success'); syncToDrive('removeNode');
        }

        async function editCpValue(nodeId, event) {
            if (event) event.stopPropagation();
            if (draggedNodeId || linkingFromNodeId) { showToast('請先完成或取消當前的動作', 'warning'); return; }
            const node = getNode(nodeId); if (!node) return;
            
            const html = `
            <div style="text-align:left; max-width: 600px; margin: 0 auto; min-height: 400px; display: flex; flex-direction: column;">
                <div class="token-creator" style="margin-bottom: 20px;">
                    <input type="text" id="modal-cp-name" placeholder="CP名稱(例:看到甜點)" style="flex: 2; min-width: 150px;">
                    <div style="display: flex; align-items: center; gap: 4px; flex: 1; min-width: 100px;">
                        <input type="number" id="modal-cp-score" placeholder="分數" style="flex: 1; min-width: 60px;">
                    </div>
                    <select id="modal-cp-time" style="flex: 1; min-width: 120px;">
                        <option value="st">短期 CP</option>
                        <option value="lt">長期 CP</option>
                    </select>
                    <button class="primary" id="btn-add-cp-token" style="padding: 10px;">➕ 加入</button>
                </div>

                <div style="display: flex; gap: 15px; flex: 1;">
                    <div style="flex: 1; border: 2px dashed var(--st-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column;">
                        <div style="color: var(--st-color); font-weight: bold; text-align: center; margin-bottom: 10px;">⚡ 短期 (ST)</div>
                        <div id="st-token-list" style="flex: 1; display: flex; flex-direction: column; gap: 8px;"></div>
                        <div style="text-align: center; margin-top: 10px; font-weight: bold; border-top: 1px solid #ddd; padding-top: 5px;">總短期: <span id="modal-st-total">0</span></div>
                    </div>
                    <div style="flex: 1; border: 2px dashed var(--lt-color); border-radius: 8px; padding: 10px; display: flex; flex-direction: column;">
                        <div style="color: var(--lt-color); font-weight: bold; text-align: center; margin-bottom: 10px;">🌱 長期 (LT)</div>
                        <div id="lt-token-list" style="flex: 1; display: flex; flex-direction: column; gap: 8px;"></div>
                        <div style="text-align: center; margin-top: 10px; font-weight: bold; border-top: 1px solid #ddd; padding-top: 5px;">總長期: <span id="modal-lt-total">0</span></div>
                    </div>
                </div>
            </div>`;
            
            let tempTokens = [];
            if (node.cpSt !== null && node.cpSt !== 0) tempTokens.push({ id: generateId(), name: '預設短期', timeType: 'st', score: node.cpSt });
            if (node.cpLt !== null && node.cpLt !== 0) tempTokens.push({ id: generateId(), name: '預設長期', timeType: 'lt', score: node.cpLt });

            const renderTokens = () => {
                const stList = document.getElementById('st-token-list');
                const ltList = document.getElementById('lt-token-list');
                if (!stList || !ltList) return;
                
                stList.innerHTML = ''; ltList.innerHTML = '';
                let stSum = 0, ltSum = 0;
                
                tempTokens.forEach((t, i) => {
                    const el = document.createElement('div');
                    el.className = 'cp-token ' + (t.timeType === 'st' ? 'st-token' : 'lt-token');
                    el.innerHTML = `<span>${t.name} (${t.score})</span> <span class="token-del" data-idx="${i}">✖</span>`;
                    
                    if (t.timeType === 'st') { stList.appendChild(el); stSum += t.score; }
                    else { ltList.appendChild(el); ltSum += t.score; }
                });
                
                document.getElementById('modal-st-total').innerText = stSum;
                document.getElementById('modal-lt-total').innerText = ltSum;
                
                document.querySelectorAll('.token-del').forEach(delBtn => {
                    delBtn.onclick = function() {
                        tempTokens.splice(parseInt(this.getAttribute('data-idx')), 1);
                        renderTokens();
                    };
                });
            };

            setTimeout(() => {
                renderTokens();
                const addBtn = document.getElementById('btn-add-cp-token');
                if (addBtn) {
                    addBtn.onclick = () => {
                        const name = document.getElementById('modal-cp-name').value.trim() || '未命名';
                        const score = parseFloat(document.getElementById('modal-cp-score').value) || 0;
                        const type = document.getElementById('modal-cp-time').value;
                        tempTokens.push({ id: generateId(), name, timeType: type, score });
                        renderTokens();
                    };
                }
            }, 100);

            const ok = await showModal({ title: `📊 編輯 CP 值 — ${node.label}`, message: html, confirmText: '儲存', cancelText: '取消' });
            if (!ok) return;
            
            let finalSt = tempTokens.filter(t => t.timeType === 'st').reduce((sum, t) => sum + t.score, 0);
            let finalLt = tempTokens.filter(t => t.timeType === 'lt').reduce((sum, t) => sum + t.score, 0);
            
            node.cpSt = tempTokens.length > 0 && tempTokens.some(t => t.timeType === 'st') ? finalSt : null;
            node.cpLt = tempTokens.length > 0 && tempTokens.some(t => t.timeType === 'lt') ? finalLt : null;
            if (tempTokens.length === 0) { node.cpSt = null; node.cpLt = null; }
            
            renderTree(); showToast('CP 值已更新', 'success'); syncToDrive('editCpValue');
        }

        let linkingFromNodeId = null;

        function linkNode(nodeId, event) {
            if (event) event.stopPropagation();
            if (draggedNodeId) {
                showToast('請先取消目前的移動狀態', 'warning');
                return;
            }
            if (linkingFromNodeId && linkingFromNodeId !== nodeId) {
                showToast('請先完成目前的連結，或再次點擊原按鈕以取消。', 'warning');
                return;
            }
            
            const btn = document.getElementById(`link-btn-${nodeId}`);
            if (!btn) return;
            
            if (linkingFromNodeId === nodeId) {
                // Toggle off
                linkingFromNodeId = null;
                btn.style.background = '';
                btn.style.color = '';
                btn.style.borderColor = '';
            } else {
                linkingFromNodeId = nodeId;
                btn.style.background = 'red';
                btn.style.color = 'white';
                btn.style.borderColor = 'red';
                showToast('請點擊目標節點以建立/移除連結', 'info');
            }
        }

        function handleNodeClick(nodeId, event) {
            if (linkingFromNodeId && linkingFromNodeId !== nodeId) {
                const exists = nodeTree.links.some(l => l.from === linkingFromNodeId && l.to === nodeId);
                if (!exists) {
                    nodeTree.links.push({ from: linkingFromNodeId, to: nodeId });
                    showToast('已建立連結', 'success');
                } else {
                    nodeTree.links = nodeTree.links.filter(l => !(l.from === linkingFromNodeId && l.to === nodeId));
                    showToast('已移除連結', 'success');
                }
                syncToDrive('linkNode');
                drawLinks();
            }
        }

        async function addLooseNode(colId) {
            if (draggedNodeId || linkingFromNodeId) { showToast('請先完成或取消當前的動作', 'warning'); return; }
            
            const result = await showModal({
                title: '➕ 新增節點',
                message: '<input type="text" id="modal-new-node-label" placeholder="輸入節點名稱..." style="width: 100%; margin-top: 10px;">',
                buttons: [
                    { text: '取消', className: 'modal-btn-cancel', value: 'cancel' },
                    { text: '✅ 確定', className: 'modal-btn-primary', value: 'confirm' }
                ]
            });
            if (result === 'confirm') {
                const newLabel = document.getElementById('modal-new-node-label').value.trim();
                if (newLabel) {
                    const newId = 'n_' + generateId(); 
                    const nodesInCol = getNodesByColumn(colId);
                    const lastY = nodesInCol.length > 0 ? Math.max(...nodesInCol.map(n => n.yOffset || 60)) + 80 : 60;
                    nodeTree.nodes.push({ id: newId, label: newLabel, isRoot: false, columnId: colId, yOffset: lastY, cpSt: null, cpLt: null }); 
                    renderTree(); 
                    syncToDrive('addNode');
                }
            }
        }

        let draggedNodeId = null;
        let isNodeDragging = false;
        let nodeDragOffsetY = 0;

        function changePlaceNode(nodeId, event) {
            if (event) event.stopPropagation();
            if (linkingFromNodeId) {
                showToast('請先取消目前的連結狀態', 'warning');
                return;
            }
            if (draggedNodeId && draggedNodeId !== nodeId) {
                showToast('請先完成目前的移動，或再次點擊原按鈕以取消。', 'warning');
                return;
            }
            
            const btn = document.getElementById(`drag-btn-${nodeId}`);
            if (!btn) return;
            
            // Toggle dragging state
            if (draggedNodeId === nodeId) {
                // Turn off drag
                draggedNodeId = null;
                isNodeDragging = false;
                btn.style.background = ''; // revert
                btn.style.color = '';
                btn.style.borderColor = '';
                syncToDrive('changePlaceNode');
            } else {
                draggedNodeId = nodeId;
                isNodeDragging = true;
                btn.style.background = 'orange';
                btn.style.color = 'white';
                btn.style.borderColor = 'orange';
            }
        }

        // =========================================================================
        // View 1: 渲染 6-Column Layout 
        // =========================================================================
        function renderTree() {
            let renderArea = document.getElementById('tree-render-area');
            const colNames = {
                1: 'Human Brain (Root)',
                2: '提示 (Cue)',
                3: '渴望 (Craving)',
                4: '回應 (Response)',
                5: '獎賞 (Reward)',
                6: '底層需求 (Base)'
            };

            let html = '<div class="canvas-columns" id="canvas-columns-container">';
            
            // Background SVG for Drawing Links
            html += `<svg id="canvas-links-svg" style="position: absolute; top:0; left:0; width:100%; height:100%; pointer-events: none; z-index: 1;">
                <defs>
                    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                        <polygon points="0 0, 10 3.5, 0 7" fill="#888" />
                    </marker>
                </defs>
            </svg>`;
            
            // Generate columns 1 to 6
            for (let i = 1; i <= 6; i++) {
                const nodes = getNodesByColumn(i);
                
                html += `
                <div class="canvas-column" data-col="${i}">
                    <div class="canvas-column-header" data-col="${i}">
                        ${colNames[i]}
                        ${i > 1 ? `<span style="cursor:pointer; color: #888; margin-left:8px;" onclick="addLooseNode(${i})" title="新增獨立節點">➕</span>` : ''}
                    </div>
                    <div class="nodes-container">
                        ${nodes.map(nd => {
                            const cpParts = [];
                            if (nd.cpSt !== null) cpParts.push(`⚡<span style="color:var(--st-color); font-weight:bold;">${nd.cpSt}</span>`);
                            if (nd.cpLt !== null) cpParts.push(`🌱<span style="color:var(--lt-color); font-weight:bold;">${nd.cpLt}</span>`);
                            const cpHTML = cpParts.length > 0 ? `<div class="node-cp-display">${cpParts.join(' | ')}</div>` : '';
                            
                            // Buttons for all nodes including root
                            const dragStyle = (draggedNodeId === nd.id) ? 'background: orange; color: white; border-color: orange;' : '';
                            const linkStyle = (linkingFromNodeId === nd.id) ? 'background: red; color: white; border-color: red;' : '';
                            
                            const btnsHTML = `
                                <span class="node-change-place" id="drag-btn-${nd.id}" data-id="${nd.id}" onclick="changePlaceNode('${nd.id}', event)" title="拖曳以變更位置" style="${dragStyle}">🔄</span>
                                <div class="node-action-btns">
                                    ${!nd.isRoot ? `<button class="node-btn node-btn-remove" onclick="removeNode('${nd.id}', event)" title="刪除">🗑️</button>` : ''}
                                    <button class="node-btn node-btn-cp" onclick="editCpValue('${nd.id}', event)" title="CP值">📊</button>
                                    <button class="node-btn node-btn-link" id="link-btn-${nd.id}" onclick="linkNode('${nd.id}', event)" title="連結" style="${linkStyle}">🔗</button>
                                </div>`;
                                
                            // Determine border configuration based on column and CP to match old style exactly
                            // All nodes now mimic "demand-node" base styling according to updated requirements
                            let boxStyle = "demand-node";
                            if (nd.isRoot) {
                                boxStyle += " root-node";
                            } else {
                                boxStyle += " action-node";
                                if (nd.cpLt !== null) {
                                    if (nd.cpLt < 0) boxStyle += " lt-negative";
                                    else if (nd.cpLt > 0) boxStyle += " lt-positive";
                                }
                            }
                            
                            // Re-calculate dynamic CP to display it natively like old.html
                            let dynamicCp = null;
                            if (nd.cpSt !== null || nd.cpLt !== null) {
                                let st = nd.cpSt || 0;
                                let lt = nd.cpLt || 0;
                                dynamicCp = st + (lt * window.ltMultiplier);
                            }
                            
                            const cpLabelColor = dynamicCp !== null && dynamicCp >= 0 ? "color: var(--good);" : "color: var(--bad);";
                            
                            let innerContent = "";
                            if (nd.isRoot) {
                                innerContent = `<strong>${nd.label}</strong><br><small>${nd.desc || '預設尋求高性價比'}</small>`;
                            } else if (nd.columnId === 6) {
                                innerContent = `<strong>Demand: <br>${nd.label}</strong>`;
                            } else {
                                innerContent = `<strong>${nd.label}</strong>`;
                                if (dynamicCp !== null) {
                                    innerContent += `<div class="action-cp-text" style="${cpLabelColor}">當下體感 CP: ${dynamicCp.toFixed(2)}</div>`;
                                }
                            }

                            return `
                            <div class="node-box ${boxStyle}" id="node-${nd.id}" onclick="handleNodeClick('${nd.id}', event)" style="position: absolute; top: ${nd.yOffset || 60}px; left: 50%; transform: translateX(-50%); width: 160px;">
                                ${innerContent}
                                ${cpHTML}
                                ${btnsHTML}
                            </div>`;
                        }).join('')}
                    </div>
                    ${i < 6 ? '<div class="canvas-divider" style="right: -60px; left: auto;"></div>' : ''}
                </div>`;
            }
            
            html += '</div>';
            renderArea.innerHTML = html;
            
            // Schedule link drawing
            setTimeout(drawLinks, 50);
        }
        
        function drawLinks() {
            const svg = document.getElementById('canvas-links-svg');
            if (!svg) return;
            const container = document.getElementById('canvas-columns-container');
            if (!container) return;
            
            const contRect = container.getBoundingClientRect();
            // Match dimensions
            svg.setAttribute('width', container.scrollWidth);
            svg.setAttribute('height', container.scrollHeight);
            
            // Keep defs in innerHTML
            let svgHTML = `<defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#999" />
                </marker>
            </defs>`;
            
            nodeTree.links.forEach(l => {
                const elFrom = document.getElementById(`node-${l.from}`);
                const elTo = document.getElementById(`node-${l.to}`);
                
                if (elFrom && elTo) {
                    const fRect = elFrom.getBoundingClientRect();
                    const tRect = elTo.getBoundingClientRect();
                    const rCont = container.getBoundingClientRect();
                    
                    const curScale = window.scale || 1;
                    
                    // Coordinates relative to SVG container bounding client rect, accounting for zoom scale
                    const x1 = ((fRect.left - rCont.left) + fRect.width / 2) / curScale;
                    const y1 = ((fRect.top - rCont.top) + fRect.height / 2) / curScale;
                    const x2 = ((tRect.left - rCont.left) + tRect.width / 2) / curScale;
                    const y2 = ((tRect.top - rCont.top) + tRect.height / 2) / curScale;
                    
                    const dx = x2 - x1;
                    const dy = y2 - y1;
                    
                    const halfWSource = (fRect.width / 2) / curScale;
                    const halfHTarget = (tRect.height / 2) / curScale;
                    const marginXSource = halfWSource + 5;
                    const marginXTarget = ((tRect.width / 2) / curScale) + 15; // extra for arrowhead + buttons
                    
                    // Simple logic: if left to right
                    let startX = x1; let startY = y1;
                    let endX = x2; let endY = y2;
                    
                    if (Math.abs(dx) > Math.abs(dy)) {
                        // Horizontal dominant
                        if (dx > 0) { startX += marginXSource; endX -= marginXTarget; } 
                        else { startX -= marginXSource; endX += marginXTarget; }
                    } else {
                        // Vertical dominant
                        if (dy > 0) { startY += halfHTarget; endY -= halfHTarget; } 
                        else { startY -= halfHTarget; endY += halfHTarget; }
                    }
                    
                    let offsetX = (endX - startX) * 0.4;
                    svgHTML += `<path d="M ${startX} ${startY} C ${startX + offsetX} ${startY}, ${endX - offsetX} ${endY}, ${endX} ${endY}" fill="none" stroke="#aaa" stroke-width="2" marker-end="url(#arrowhead)" opacity="0.7"/>`;
                }
            });
            svg.innerHTML = svgHTML;
        }

        window.addEventListener('resize', () => {
            if (document.getElementById('view-tree').classList.contains('active')) drawLinks();
        });

        // =========================================================================
        // View 2: 四階段編輯器 (init_action_of_base_demand)
        // =========================================================================
        let ltMultiplier = parseFloat(localStorage.getItem('brain_lt_multiplier')) || 0.1;

        document.addEventListener('DOMContentLoaded', () => {
            const m = parseFloat(localStorage.getItem('brain_lt_multiplier')) || 0.1;
            const multEl = document.getElementById('lt-multiplier');
            if (multEl) multEl.textContent = `× ${m}`;
            
            // Check auth status early
            if (window.location.hash.includes('access_token')) {
                const tokenMatch = window.location.hash.match(/access_token=([^&]*)/);
                if (tokenMatch) {
                    localStorage.setItem('google_access_token', tokenMatch[1]);
                    window.location.hash = ''; // Clear hash
                }
            }
            
            handleTosUI();

            if (window.innerWidth <= 600) {
                const infoPanel = document.getElementById('info-panel');
                const infoToggle = document.getElementById('info-toggle');
                if (infoPanel) infoPanel.style.display = 'none';
                if (infoToggle) infoToggle.textContent = '▶';
            }
        });

        function toggleInfoPanel() {
            const panel = document.getElementById('info-panel');
            const toggle = document.getElementById('info-toggle');
            if (panel.style.display === 'none') {
                panel.style.display = 'block';
                toggle.textContent = '▼';
            } else {
                panel.style.display = 'none';
                toggle.textContent = '▶';
            }
        }

        async function openSleepSliderModal() {
            doSleepSliderFlow();
        }

        async function checkDailySleepPrompt() {
            const today = new Date().toISOString().slice(0, 10);
            const lastSleepDate = localStorage.getItem('brain_sleep_date');

            if (lastSleepDate !== today) {
                await doSleepSliderFlow();
                localStorage.setItem('brain_sleep_date', today);
            }
        }

        async function doSleepSliderFlow() {
            const html = `
                <div style="text-align:center; padding-top: 10px;">
                    <p style="font-size: 1.1rem; margin-bottom: 20px;">最近 7 天，你睡最少的那天睡了幾個小時？</p>
                    <input type="range" id="modal-sleep-range" min="0" max="14" step="0.5" value="7" oninput="document.getElementById('modal-sleep-val').innerText = this.value + ' 小時'" style="width: 80%; cursor: pointer;">
                    <p id="modal-sleep-val" style="font-size: 1.5rem; font-weight: bold; color: var(--st-color); margin: 15px 0;">7 小時</p>
                </div>
            `;
            const ok = await showModal({
                title: '🌙 每日睡眠狀態確認',
                message: html,
                buttons: [
                    { text: '😴 確實有熬夜 (Yes)', className: 'modal-btn-danger', value: 'yes' },
                    { text: '😊 沒有熬夜 (No)', className: 'modal-btn-primary', value: 'no' }
                ]
            });

            if (ok) {
                const hours = parseFloat(document.getElementById('modal-sleep-range').value);
                setSleepFromHours(hours, ok);
            }
        }

        function setSleepFromHours(hours, choice) {
            const isStayedUp = (choice === 'yes') || (hours < 6);
            ltMultiplier = isStayedUp ? 0.01 : 0.2;
            localStorage.setItem('brain_lt_multiplier', ltMultiplier.toString());

            const multEl = document.getElementById('lt-multiplier');
            if (multEl) multEl.textContent = `× ${ltMultiplier}`;

            if (document.getElementById('view-tree').classList.contains('active')) {
                renderTree(); 
            }

            let msg = '';
            let toastType = 'success';

            if (isStayedUp) {
                toastType = 'error';
                if (choice === 'yes') {
                    msg = '😴 熬夜模式：你表示有熬夜。大腦判斷力下降，長期CP影響力降至最低 (× 0.01)';
                } else {
                    msg = `😴 熬夜模式：睡眠時數不足 (${hours} 小時 < 6 小時)。大腦判斷力下降，長期CP影響力降至最低 (× 0.01)`;
                }
            } else {
                msg = '😊 精神飽滿：大腦紀律維持，長期CP影響力提升 (× 0.2)';
            }
            showToast(msg, toastType);
        }

        // =========================================================================
        // 儲存與強制防護邏輯 (第二次編輯時強行校正)
        // =========================================================================
        // This section was removed as per instructions.

        // =========================================================================
        // Storage Mode & Local Persistence
        // =========================================================================
        const STORAGE_KEY_TREE = 'brain_tree_data';
        const STORAGE_KEY_MODE = 'brain_storage_mode';
        const STORAGE_KEY_INIT = 'brain_has_initialized';
        const STORAGE_KEY_SAVE_DATE = 'brain_last_save_date';

        // Loading overlay helpers
        function updateLoadingStatus(text) {
            const el = document.getElementById('loading-status');
            if (el) el.textContent = text;
        }
        function hideLoadingOverlay() {
            const el = document.getElementById('loading-overlay');
            if (el) { el.classList.add('hidden'); setTimeout(() => el.remove(), 500); }
        }
        function isFirstTimeUser() {
            return !localStorage.getItem(STORAGE_KEY_MODE)
                && !localStorage.getItem(STORAGE_KEY_TREE)
                && !localStorage.getItem('brain_session_token');
        }

        // Storage mode: 'local' | 'drive' | 'both'
        // Default: 'local' (no login) or 'both' (logged in)
        function getStorageMode() {
            return localStorage.getItem(STORAGE_KEY_MODE) || 'local';
        }
        function setStorageMode(mode) {
            localStorage.setItem(STORAGE_KEY_MODE, mode);
            updateMoreDropdowns();
        }

        // Save humanTree to localStorage
        function saveToLocal() {
            try {
                const data = JSON.stringify({
                    ...serializeTreeForSync(),
                    hasInitialized,
                    savedAt: new Date().toISOString()
                });
                localStorage.setItem(STORAGE_KEY_TREE, data);
                localStorage.setItem(STORAGE_KEY_INIT, hasInitialized ? '1' : '0');
            } catch (e) {
                showToast('⚠️ 本機儲存空間不足，請清理瀏覽器資料', 'error');
            }
        }

        // Load humanTree from localStorage
        function loadFromLocal() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY_TREE);
                if (!raw) return null;
                const data = JSON.parse(raw);
                return data; // Return full object so restoreTreeFromSerialized gets it
            } catch (e) { /* ignore parse errors */ }
            return null;
        }

        // Restore tree from a serialized tree object
        function restoreTreeFromSerialized(saved) {
            if (!saved) return false;
            let restored = false;

            // Restore new format if present
            if (saved.nodeTree && saved.nodeTree.nodes && saved.nodeTree.links) {
                nodeTree = saved.nodeTree;
                restored = true;
            } else if (saved.nodes && saved.links) {
                // Handle case where nodeTree itself was passed
                nodeTree = saved;
                restored = true;
            }

            // Always try to restore old format as well (incase saved only had humanTree)
            // It could be under saved.humanTree, or saved itself could be the humanTree
            let oldRoot = saved.humanTree ? saved.humanTree : (saved.children ? saved : null);
            // Handle historical double-nesting bug from local storage
            if (oldRoot && oldRoot.humanTree && oldRoot.humanTree.children) {
                oldRoot = oldRoot.humanTree;
            }
            if (oldRoot && oldRoot.children) {
                const stageNames = ['dock', 'cue', 'craving', 'response', 'reward'];
                humanTree = {
                    name: oldRoot.name || 'human',
                    children: oldRoot.children.map(demand => ({
                        id: demand.id,
                        name: demand.name,
                        actions: (demand.actions || []).map(action => {
                            const tokens = [];
                            if (action.tokenSlots) {
                                action.tokenSlots.forEach((slot, idx) => {
                                    (slot || []).forEach(t => {
                                        tokens.push({
                                            id: t.id, name: t.name, score: t.score,
                                            timeType: t.timeType, stage: stageNames[idx] || 'dock',
                                        });
                                    });
                                });
                            } else if (action.tokens) {
                                action.tokens.forEach(t => tokens.push({ ...t }));
                            }
                            return {
                                id: action.id, name: action.name, cp: action.cp,
                                st: action.st, lt: action.lt, isNew: action.isNew, tokens,
                            };
                        }),
                    })),
                };
                restored = true;
            }

            if (restored && nodeTree && nodeTree.nodes) {
                nodeTree.nodes.forEach((n, i) => {
                    if (n.columnId === undefined) {
                        if (n.isRoot) n.columnId = 1;
                        else if (n.label === '提示') n.columnId = 2;
                        else if (n.label === '渴望') n.columnId = 3;
                        else if (n.label === '回應') n.columnId = 4;
                        else if (n.label === '獎賞') n.columnId = 5;
                        else if (n.label === '底層需求') n.columnId = 6;
                        else n.columnId = 2; // Default
                        n.order = n.order || i;
                    }
                });
            }

            if (restored) hasInitialized = true;
            return restored;
        }

        // =========================================================================
        // Google Auth + Drive Sync (Token-based for cross-domain)
        // =========================================================================
        const API_BASE = 'https://addiction-murex.vercel.app';
        let currentUser = null;

        // Capture token from URL after OAuth callback
        (function captureTokenFromURL() {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            if (token) {
                localStorage.setItem('brain_session_token', token);
                const cleanUrl = window.location.origin + window.location.pathname;
                window.history.replaceState({}, document.title, cleanUrl);
            }
        })();

        function authHeaders() {
            const token = localStorage.getItem('brain_session_token');
            const headers = {};
            if (token) headers['Authorization'] = 'Bearer ' + token;
            return headers;
        }

        function loginGoogle() {
            window.location.href = API_BASE + '/api/auth/google';
        }

        async function logoutGoogle() {
            await fetch(API_BASE + '/api/auth/logout', {
                method: 'POST', headers: authHeaders(),
            });
            localStorage.removeItem('brain_session_token');
            currentUser = null;
            setStorageMode('local');
            updateAuthUI();
            showToast('已登出', 'success');
        }

        async function checkAuth() {
            updateLoadingStatus('⏳ 正在檢查登入狀態...');
            const token = localStorage.getItem('brain_session_token');

            // ===== First-time user: hide overlay and let welcome page handle =====
            if (isFirstTimeUser()) {
                hideLoadingOverlay();
                updateAuthUI();
                updateMoreDropdowns();
                return;
            }

            // ===== No token: use local only =====
            if (!token) {
                currentUser = null;
                if (!localStorage.getItem(STORAGE_KEY_MODE)) setStorageMode('local');
                updateLoadingStatus('📂 正在載入本機資料...');
                const localTree = loadFromLocal();
                if (localTree && restoreTreeFromSerialized(localTree)) {
                    initApp();
                    showToast('📂 已從本機載入資料', 'success');
                }
                updateAuthUI();
                updateMoreDropdowns();
                hideLoadingOverlay();
                return;
            }

            // ===== Has token: try to authenticate =====
            updateLoadingStatus('🔐 正在驗證登入身分...');
            try {
                const res = await fetch(API_BASE + '/api/auth/me', { headers: authHeaders() });
                const data = await res.json();
                if (data.loggedIn) {
                    currentUser = data.user;
                    // 同步 TOS 狀態
                    const localAccepted = getTosAccepted();
                    if (currentUser.tosAccepted) {
                        // DB 說好 -> 本地也設為好
                        if (!localAccepted) {
                            localStorage.setItem('brain_tos_accepted', 'true');
                        }
                    } else if (localAccepted) {
                        // 本地說好但 DB 說不 (可能是剛登入的新使用者在 Welcome 頁勾選了) -> 同步回 DB
                        setTosAccepted(true);
                    }

                    const savedMode = localStorage.getItem(STORAGE_KEY_MODE);
                    if (!savedMode || savedMode === 'local') {
                        setStorageMode('both');
                    }
                } else {
                    currentUser = null;
                }
            } catch (err) {
                currentUser = null;
            }

            updateAuthUI();
            updateMoreDropdowns();
            handleTosUI(); // 確保 UI 狀態正確反映最終同步結果

            // ===== Load data based on mode =====
            const mode = getStorageMode();
            updateLoadingStatus('📂 正在載入本機資料...');
            const localTree = loadFromLocal();
            let driveTree = null;

            // Try to load Drive data if logged in and has file
            if (currentUser && currentUser.hasDriveFile && mode !== 'local') {
                updateLoadingStatus('☁️ 正在載入雲端資料...');
                try {
                    const res = await fetch(API_BASE + '/api/load-from-drive', { headers: authHeaders() });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && data.data && data.data.treeData) {
                            driveTree = data.data.treeData;
                        }
                    }
                } catch (err) { /* ignore */ }
            }

            updateLoadingStatus('🔄 正在比對資料...');

            if (mode === 'local') {
                if (localTree && restoreTreeFromSerialized(localTree)) {
                    initApp();
                    showToast('📂 已從本機載入資料', 'success');
                }
            } else if (mode === 'drive') {
                if (driveTree) {
                    restoreTreeFromSerialized(driveTree);
                    saveToLocal();
                    initApp();
                    showToast('☁️ 已從 Google Drive 載入資料', 'success');
                } else if (localTree && restoreTreeFromSerialized(localTree)) {
                    initApp();
                    showToast('📂 雲端資料不可用，已從本機載入', 'success');
                }
            } else {
                // mode === 'both' → compare local and Drive
                if (localTree && driveTree) {
                    const localStr = JSON.stringify(localTree);
                    const driveStr = JSON.stringify(driveTree);
                    if (localStr !== driveStr) {
                        hideLoadingOverlay();
                        showConflictDialog(localTree, driveTree, '📂 本機版本', '☁️ Google Drive 版本', 'auto');
                        return;
                    }
                }
                // Same or only one exists
                if (driveTree) {
                    restoreTreeFromSerialized(driveTree);
                    saveToLocal();
                    initApp();
                    showToast('☁️ 已從 Google Drive 載入資料', 'success');
                } else if (localTree) {
                    restoreTreeFromSerialized(localTree);
                    initApp();
                    showToast('📂 已從本機載入資料', 'success');
                }
            }

            // If logged in but no Drive file
            if (!hasInitialized && currentUser && !currentUser.hasDriveFile) {
                if (localTree && restoreTreeFromSerialized(localTree)) {
                    initApp();
                    showToast('📂 已從本機載入資料', 'success');
                }
            }

            hideLoadingOverlay();
        }

        function updateAuthUI() {
            // Tree page items only since welcome page was removed
            const tLoggedOut = document.getElementById('tree-logged-out');
            const tLoggedIn = document.getElementById('tree-logged-in');
            const tUserName = document.getElementById('tree-user-name');
            const tAvatar = document.getElementById('tree-user-avatar');
            const tPicker = document.getElementById('btn-tree-picker');

            if (currentUser) {
                if (tLoggedOut) tLoggedOut.style.display = 'none';
                if (tLoggedIn) tLoggedIn.style.display = 'flex';
                if (tUserName) tUserName.textContent = currentUser.name;
                if (tAvatar) {
                    tAvatar.src = currentUser.picture || '';
                    tAvatar.style.display = currentUser.picture ? 'block' : 'none';
                }
                if (tPicker) tPicker.style.display = currentUser.hasDriveFile ? 'none' : 'inline-block';
            } else {
                if (tLoggedOut) tLoggedOut.style.display = 'block';
                if (tLoggedIn) tLoggedIn.style.display = 'none';
            }
        }

        // =========================================================================
        // Conflict Resolution
        // =========================================================================
        function treePreviewHTML(tree) {
            let targetTree = tree;
            if (tree && tree.humanTree) {
                targetTree = tree.humanTree;
                // Handle historical double-nesting bug
                if (targetTree.humanTree) {
                    targetTree = targetTree.humanTree;
                }
            }
            
            if (targetTree && targetTree.children && targetTree.children.length > 0) {
                let html = '';
                targetTree.children.forEach(d => {
                    html += `<div class="demand-item">🔹 ${d.name}</div>`;
                    (d.actions || []).forEach(a => {
                        const cp = typeof a.cp === 'number' ? a.cp.toFixed(2) : '?';
                        html += `<div class="action-item">├ ${a.name} (CP: ${cp})</div>`;
                    });
                });
                return html;
            }

            // Fallback to nodeTree if humanTree is empty but nodeTree exists
            if (tree && tree.nodeTree && tree.nodeTree.nodes && tree.nodeTree.nodes.length > 0) {
                let html = '<div style="font-size:0.85rem; color:#666; margin-bottom:5px;">[新版圖譜資料]</div>';
                const demandNodes = tree.nodeTree.nodes.filter(n => n.label === '底層需求');
                demandNodes.forEach(d => {
                    html += `<div class="demand-item">🔹 ${d.name || '未命名'}</div>`;
                });
                if(demandNodes.length === 0) {
                    html += `<div class="demand-item">包含 ${tree.nodeTree.nodes.length} 個節點</div>`;
                }
                return html;
            }

            return '<div style="color:#999;">（無資料）</div>';
        }

        // conflictSource: 'auto' (page load), 'importLocal', 'importDrive'
        let pendingConflictLeft = null;
        let pendingConflictRight = null;
        let pendingConflictSource = null;

        function generateFileName() {
            const now = new Date();
            const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
            return `addiction-log-export-${ts}.json`;
        }

        function showConflictDialog(leftTree, rightTree, leftTitle, rightTitle, source) {
            pendingConflictLeft = leftTree;
            pendingConflictRight = rightTree;
            pendingConflictSource = source;
            document.getElementById('conflict-left-title').textContent = leftTitle;
            document.getElementById('conflict-right-title').textContent = rightTitle;
            document.getElementById('conflict-btn-left').textContent = `📂 使用${leftTitle.replace(/[^\u4e00-\u9fff\w\s]/g, '').trim()}`;
            document.getElementById('conflict-btn-right').textContent = `☁️ 使用${rightTitle.replace(/[^\u4e00-\u9fff\w\s]/g, '').trim()}`;
            document.getElementById('conflict-local-preview').innerHTML = treePreviewHTML(leftTree);
            document.getElementById('conflict-drive-preview').innerHTML = treePreviewHTML(rightTree);
            document.getElementById('conflict-overlay').classList.add('show');
        }

        async function resolveConflict(choice) {
            document.getElementById('conflict-overlay').classList.remove('show');

            const chosenTree = choice === 'left' ? pendingConflictLeft : pendingConflictRight;

            if (!chosenTree) {
                showToast('⚠️ 所選版本資料為空', 'error');
                return;
            }

            // Restore the chosen version
            restoreTreeFromSerialized(chosenTree);
            saveToLocal();
            initApp();

            // Create new Drive file (because import diff → new file)
            const mode = getStorageMode();
            if ((mode === 'drive' || mode === 'both') && currentUser) {
                try {
                    const fileName = generateFileName();
                    const reqBody = { fileName };
                    if (currentUser.driveFolderId) {
                        reqBody.parentFolderId = currentUser.driveFolderId;
                    }
                    const createRes = await fetch(API_BASE + '/api/create-drive-file', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify(reqBody),
                    });
                    const createData = await createRes.json();
                    if (createData.success) {
                        currentUser.hasDriveFile = true;
                        currentUser.driveFolderName = createData.folderName || null;
                        currentUser.driveFolderId = createData.folderId || null;
                        updateAuthUI();
                        await syncToDriveInternal('conflict_resolve');
                        localStorage.setItem(STORAGE_KEY_SAVE_DATE, new Date().toISOString().slice(0, 10));
                        showToast('✅ 已建立新版本並同步至 Google Drive', 'success');
                    } else if (createData.error === 'folder_access_lost') {
                        currentUser.driveFolderId = null;
                        currentUser.driveFolderName = null;
                        showToast('⚠️ 先前使用的資料夾已無法存取，請重新選擇資料夾', 'error');
                        openDrivePicker();
                    } else {
                        if (createRes.status === 402 || createRes.status === 403) {
                            showToast('⚠️ Google Drive 空間不足，無法建立檔案', 'error');
                        } else {
                            showToast('⚠️ 建立雲端檔案失敗：' + (createData.error || '未知錯誤'), 'error');
                        }
                    }
                } catch (err) {
                    showToast('⚠️ 雲端操作失敗：' + err.message, 'error');
                }
            }

            showToast('💡 我們不會刪除您的任何檔案，所有舊檔案都保留在原處，您可自行管理。', 'warning');
            pendingConflictLeft = null;
            pendingConflictRight = null;
            pendingConflictSource = null;
        }

        // =========================================================================
        // Load / Sync to Drive
        // =========================================================================
        async function loadTreeFromDrive() {
            if (!currentUser) {
                showToast('⚠️ 請先登入 Google', 'error');
                return;
            }
            if (!currentUser.hasDriveFile) {
                showToast('⚠️ 您尚未設定同步檔案，請先選擇或建立 Google Drive 資料夾！', 'error');
                openDrivePicker('save');
                return;
            }

            try {
                const res = await fetch(API_BASE + '/api/load-from-drive', { headers: authHeaders() });
                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    showToast('⚠️ 匯入失敗：' + (errorData.error || '無法讀取雲端檔案'), 'error');
                    return;
                }
                const data = await res.json();
                if (data.success && data.data && data.data.treeData) {
                    if (restoreTreeFromSerialized(data.data.treeData)) {
                        saveToLocal();
                        initApp();
                        showToast('☁️ 已從 Google Drive 載入資料', 'success');
                    }
                }
            } catch (err) {
                console.error('Load from Drive error:', err);
                showToast('⚠️ 匯入發生例外錯誤：' + err.message, 'error');
            }
        }

        async function openDrivePicker(pickerType = 'save') {
            if (!currentUser) {
                showToast('⚠️ 請先登入 Google', 'error');
                return;
            }

            const isImport = pickerType === 'import';

            // Show loading modal
            const overlay = document.getElementById('modal-overlay');
            document.getElementById('modal-title').textContent = isImport ? '📥 設定自動匯入資料夾' : '📁 更換 Google Drive 路徑';
            document.getElementById('modal-message').innerHTML = '<div class="picker-loading">⏳ 正在載入資料夾列表...</div>';
            document.getElementById('modal-input').style.display = 'none';
            document.getElementById('modal-actions').innerHTML = `<button class="modal-btn-cancel" onclick="document.getElementById('modal-overlay').classList.remove('show')">取消</button>`;
            overlay.classList.add('show');

            try {
                const res = await fetch(API_BASE + '/api/browse-drive?action=folders', { headers: authHeaders() });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '載入失敗');

                const folders = data.folders || [];
                let selectedFolderId = data.currentFolderId || null;
                let selectedFolderName = data.currentFolder || '';

                // Build folder list HTML
                let listHTML = '<div class="picker-list">';
                // Root (no folder) option
                listHTML += `<div class="picker-item${!selectedFolderId ? ' active' : ''}" data-id="" data-name="">
                    <span>📁</span> <span>根目錄 (My Drive)</span>
                </div>`;
                folders.forEach(f => {
                    const isActive = selectedFolderId && f.id === selectedFolderId;
                    const date = new Date(f.modifiedTime).toLocaleDateString();
                    listHTML += `<div class="picker-item${isActive ? ' active' : ''}" data-id="${f.id}" data-name="${f.name}">
                        <span>📂</span> <span>${f.name}</span> <span class="picker-meta">${date}</span>
                    </div>`;
                });
                if (folders.length === 0) {
                    listHTML += '<div class="picker-empty">目前沒有任何資料夾</div>';
                }
                listHTML += '</div>';

                // Create new folder input
                listHTML += `<div class="picker-create-row">
                    <input type="text" id="new-folder-name" placeholder="輸入新資料夾名稱..." class="modal-box input">
                    <button class="modal-btn-primary" id="btn-create-folder" style="padding:10px 16px;">➕ 建立</button>
                </div>`;

                document.getElementById('modal-message').innerHTML = '選擇現有資料夾，或建立新的：' + listHTML;
                document.getElementById('modal-actions').innerHTML =
                    `<button class="modal-btn-cancel" id="picker-cancel">取消</button>` +
                    `<button class="modal-btn-primary" id="picker-confirm">✅ 使用此資料夾</button>`;

                // Event: click folder item
                document.querySelectorAll('.picker-item').forEach(item => {
                    item.addEventListener('click', () => {
                        document.querySelectorAll('.picker-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        selectedFolderId = item.getAttribute('data-id');
                        selectedFolderName = item.getAttribute('data-name');
                    });
                });

                // Event: create new folder
                document.getElementById('btn-create-folder').onclick = async () => {
                    const newName = document.getElementById('new-folder-name').value.trim();
                    if (!newName) { showToast('⚠️ 請輸入資料夾名稱', 'error'); return; }
                    selectedFolderName = newName;
                    selectedFolderId = null; // backend will create it
                    // Visual feedback
                    document.querySelectorAll('.picker-item').forEach(i => i.classList.remove('active'));
                    showToast(`📂 將建立新資料夾「${newName}」`, 'success');
                    // Auto-confirm
                    await doPickerConfirm(selectedFolderName);
                };

                // Event: cancel
                document.getElementById('picker-cancel').onclick = () => overlay.classList.remove('show');

                // Event: confirm
                document.getElementById('picker-confirm').onclick = () => doPickerConfirm(selectedFolderName);

                async function doPickerConfirm(folderName) {
                    overlay.classList.remove('show');
                    const fileName = generateFileName();
                    showToast('⏳ 正在建立檔案...', 'warning');
                    try {
                        const reqBody = { fileName, folderName: folderName || undefined };
                        // Tell backend how to handle existing folders
                        if (selectedFolderId) {
                            reqBody.folderConflictStrategy = 'use_existing';
                            reqBody.existingFolderId = selectedFolderId;
                        } else if (folderName) {
                            reqBody.folderConflictStrategy = 'create_new';
                        }
                        const createRes = await fetch(API_BASE + '/api/create-drive-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders() },
                            body: JSON.stringify(reqBody),
                        });
                        const createData = await createRes.json();
                        if (createData.success) {
                            currentUser.hasDriveFile = true;
                            currentUser.driveFolderName = createData.folderName || null;
                            currentUser.driveFolderId = createData.folderId || null;
                            updateAuthUI();
                            showToast(`☁️ 已在${folderName ? `「${folderName}」` : '根目錄'}建立同步檔案`, 'success');
                        } else {
                            showToast('⚠️ 建立失敗：' + (createData.error || '未知錯誤'), 'error');
                        }
                    } catch (err) {
                        showToast('⚠️ 操作失敗：' + err.message, 'error');
                    }
                }
            } catch (err) {
                overlay.classList.remove('show');
                showToast('⚠️ 載入資料夾失敗：' + err.message, 'error');
            }
        }

        // Serialize trees for sync
        function serializeTreeForSync() {
            const stageMap = { dock: 0, cue: 1, craving: 2, response: 3, reward: 4 };
            const serializedHumanTree = {
                name: humanTree.name,
                children: humanTree.children.map(demand => ({
                    id: demand.id,
                    name: demand.name,
                    actions: demand.actions.map(action => {
                        const tokenSlots = [[], [], [], [], []];
                        (action.tokens || []).forEach(t => {
                            const idx = stageMap[t.stage] !== undefined ? stageMap[t.stage] : 0;
                            tokenSlots[idx].push({
                                id: t.id, name: t.name, score: t.score, timeType: t.timeType,
                            });
                        });
                        return {
                            id: action.id, name: action.name, cp: action.cp,
                            st: action.st, lt: action.lt, isNew: action.isNew, tokenSlots,
                        };
                    }),
                })),
            };
            
            return {
                version: 2,
                humanTree: serializedHumanTree, // For old.html
                nodeTree: nodeTree              // For current app
            };
        }

        // Internal sync (used by conflict resolution + normal sync)
        async function syncToDriveInternal(triggerAction) {
            if (!currentUser) return false;
            
            if (!currentUser.hasDriveFile) {
                if (triggerAction === 'manual_save' || triggerAction === 'manual_export') {
                    showToast('⚠️ 您尚未設定同步檔案，請先選擇或建立 Google Drive 資料夾！', 'error');
                    openDrivePicker('save');
                }
                return false;
            }

            try {
                const payload = {
                    triggerAction,
                    treeData: serializeTreeForSync(),
                    syncTimestamp: new Date().toISOString(),
                };
                const res = await fetch(API_BASE + '/api/sync-drive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(payload),
                });
                if (res.ok) return true;

                const data = await res.json();
                if (res.status === 402 || res.status === 403) {
                    showToast('⚠️ Google Drive 空間不足，無法同步，請清理雲端空間', 'error');
                }
                throw new Error(data.error || '同步失敗');
            } catch (err) {
                throw err;
            }
        }

        // Public sync function: respects storage mode + next-day detection
        async function syncToDrive(triggerAction, isFromImportDiff = false) {
            const mode = getStorageMode();
            const today = new Date().toISOString().slice(0, 10);
            const lastSaveDate = localStorage.getItem(STORAGE_KEY_SAVE_DATE);
            const needNewFile = (lastSaveDate && today !== lastSaveDate) || isFromImportDiff;

            // Always save to local if mode is 'local' or 'both'
            if (mode === 'local' || mode === 'both') {
                saveToLocal();
            }

            // Sync to Drive if mode is 'drive' or 'both'
            if ((mode === 'drive' || mode === 'both') && currentUser && currentUser.hasDriveFile) {
                const syncDot = document.getElementById('sync-dot');
                if (syncDot) {
                    syncDot.className = 'sync-indicator syncing';
                    syncDot.title = '同步中...';
                }
                try {
                    if (needNewFile) {
                        // Next day or import diff → create new file first
                        const fileName = generateFileName();
                        const reqBody = { fileName };
                        if (currentUser.driveFolderId) {
                            reqBody.parentFolderId = currentUser.driveFolderId;
                        }
                        const createRes = await fetch(API_BASE + '/api/create-drive-file', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders() },
                            body: JSON.stringify(reqBody),
                        });
                        const createData = await createRes.json();
                        if (createData.success) {
                            currentUser.hasDriveFile = true;
                            currentUser.driveFolderName = createData.folderName || null;
                            currentUser.driveFolderId = createData.folderId || null;
                            updateAuthUI();
                        } else if (createData.error === 'folder_access_lost') {
                            currentUser.driveFolderId = null;
                            currentUser.driveFolderName = null;
                            showToast('⚠️ 先前使用的資料夾已無法存取，請重新選擇資料夾', 'error');
                            openDrivePicker();
                            return;
                        } else {
                            throw new Error(createData.error || '建立新檔案失敗');
                        }
                    }
                    // Now write data to the (new or existing) controlled file
                    await syncToDriveInternal(triggerAction);
                    if (syncDot) {
                        syncDot.className = 'sync-indicator synced';
                        syncDot.title = '已同步';
                    }
                    showToast(needNewFile ? '☁️ 已建立新檔案並同步至 Google Drive' : '☁️ 已同步至 Google Drive', 'success');
                } catch (err) {
                    if (syncDot) {
                        syncDot.className = 'sync-indicator error';
                        syncDot.title = '同步失敗';
                    }
                    showToast('⚠️ Drive 同步失敗：' + err.message, 'error');
                }
            }

            // If local-only mode, also save to local
            if (mode === 'local') {
                saveToLocal();
            }

            // Track today's date
            localStorage.setItem(STORAGE_KEY_SAVE_DATE, today);
        }

        // =========================================================================
        // Local File Export / Import
        // =========================================================================
        function exportToLocalFile() {
            const data = JSON.stringify({
                exportedAt: new Date().toISOString(),
                treeData: serializeTreeForSync(),
            }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = generateFileName();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast('💾 已匯出至本機檔案', 'success');
        }

        function importFromLocalFile() {
            document.getElementById('local-file-input').click();
        }

        function handleLocalFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            if (!file.name.toLowerCase().endsWith('.json')) {
                showToast('⚠️ 只支援 .json 檔案', 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = function (e) {
                try {
                    const parsed = JSON.parse(e.target.result);
                    const importedTree = parsed.treeData || parsed.humanTree || parsed;
                    if (!importedTree || !importedTree.children || importedTree.children.length === 0) {
                        showToast('⚠️ 檔案格式不正確，無法匯入', 'error');
                        return;
                    }
                    // Compare with current web data
                    const currentTree = serializeTreeForSync();
                    const currentStr = JSON.stringify(currentTree);
                    const importedStr = JSON.stringify(importedTree);
                    if (hasInitialized && currentStr !== importedStr) {
                        // Different → show conflict dialog
                        showConflictDialog(currentTree, importedTree, '🖥️ 目前網頁資料', '📂 匯入的檔案', 'importLocal');
                    } else {
                        // Same or no existing data → apply directly
                        restoreTreeFromSerialized(importedTree);
                        saveToLocal();
                        initApp();
                        showToast('📂 已從本機檔案匯入資料', 'success');
                        syncToDrive('importLocalFile', true);
                    }
                } catch (err) {
                    showToast('⚠️ 檔案解析失敗：' + err.message, 'error');
                }
            };
            reader.readAsText(file);
            event.target.value = ''; // Reset for re-import
        }

        // Manual import from Google Drive with file picker (does NOT change auto-save mode)
        async function importFromDrive() {
            if (!currentUser) {
                showToast('⚠️ 請先登入 Google', 'error');
                return;
            }

            // Show loading modal
            const overlay = document.getElementById('modal-overlay');
            document.getElementById('modal-title').textContent = '☁️ 從 Google Drive 匯入';
            document.getElementById('modal-message').innerHTML = '<div class="picker-loading">⏳ 正在載入檔案列表...</div>';
            document.getElementById('modal-input').style.display = 'none';
            document.getElementById('modal-actions').innerHTML = `<button class="modal-btn-cancel" onclick="document.getElementById('modal-overlay').classList.remove('show')">取消</button>`;
            overlay.classList.add('show');

            try {
                const res = await fetch(API_BASE + '/api/browse-drive?action=files', { headers: authHeaders() });
                const data = await res.json();
                if (!data.success) throw new Error(data.error || '載入失敗');

                const files = data.files || [];
                let selectedFileId = null;

                let listHTML = '<div class="picker-list">';
                if (files.length === 0) {
                    listHTML += '<div class="picker-empty">找不到任何 .json 檔案</div>';
                } else {
                    files.forEach(f => {
                        const date = new Date(f.modifiedTime).toLocaleString();
                        const sizeKB = f.size ? (parseInt(f.size) / 1024).toFixed(1) + ' KB' : '';
                        listHTML += `<div class="picker-item" data-id="${f.id}">
                            <span>📄</span> <span>${f.name}</span> <span class="picker-meta">${sizeKB} ・ ${date}</span>
                        </div>`;
                    });
                }
                listHTML += '</div>';

                document.getElementById('modal-message').innerHTML = '選擇要匯入的檔案：' + listHTML;
                document.getElementById('modal-actions').innerHTML =
                    `<button class="modal-btn-cancel" id="file-picker-cancel">取消</button>` +
                    `<button class="modal-btn-primary" id="file-picker-confirm" disabled>✅ 匯入此檔案</button>`;

                // Event: click file item
                document.querySelectorAll('.picker-item').forEach(item => {
                    item.addEventListener('click', () => {
                        document.querySelectorAll('.picker-item').forEach(i => i.classList.remove('active'));
                        item.classList.add('active');
                        selectedFileId = item.getAttribute('data-id');
                        document.getElementById('file-picker-confirm').disabled = false;
                    });
                });

                document.getElementById('file-picker-cancel').onclick = () => overlay.classList.remove('show');

                document.getElementById('file-picker-confirm').onclick = async () => {
                    if (!selectedFileId) return;
                    overlay.classList.remove('show');
                    showToast('⏳ 正在載入檔案...', 'warning');
                    try {
                        const loadRes = await fetch(API_BASE + '/api/browse-drive', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders() },
                            body: JSON.stringify({ action: 'load', fileId: selectedFileId }),
                        });
                        const loadData = await loadRes.json();
                        if (!loadData.success || !loadData.data) {
                            showToast('⚠️ 檔案讀取失敗', 'error');
                            return;
                        }
                        const driveTree = loadData.data.treeData || loadData.data;
                        const currentTree = serializeTreeForSync();
                        const currentStr = JSON.stringify(currentTree);
                        const driveStr = JSON.stringify(driveTree);
                        if (hasInitialized && currentStr !== driveStr) {
                            showConflictDialog(currentTree, driveTree, '🖥️ 目前網頁資料', '☁️ Google Drive 檔案', 'importDrive');
                        } else {
                            restoreTreeFromSerialized(driveTree);
                            saveToLocal();
                            initApp();
                            showToast('☁️ 已從 Google Drive 匯入資料', 'success');
                        }
                    } catch (err) {
                        showToast('⚠️ 載入失敗：' + err.message, 'error');
                    }
                };
            } catch (err) {
                overlay.classList.remove('show');
                showToast('⚠️ 載入檔案列表失敗：' + err.message, 'error');
            }
        }

        // =========================================================================
        // More Options (☰) Menu
        // =========================================================================
        function toggleMoreMenu(dropdownId) {
            const dropdown = document.getElementById(dropdownId);
            // Close all other dropdowns first
            document.querySelectorAll('.more-dropdown').forEach(d => {
                if (d.id !== dropdownId) d.classList.remove('show');
            });
            if (dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
            } else {
                buildMoreDropdown(dropdownId);
                dropdown.classList.add('show');
            }
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.more-options-wrapper')) {
                document.querySelectorAll('.more-dropdown').forEach(d => d.classList.remove('show'));
            }
        });

        function buildMoreDropdown(dropdownId) {
            const dropdown = document.getElementById(dropdownId);
            const mode = getStorageMode();
            const isLoggedIn = !!currentUser;
            const tosAccepted = getTosAccepted();

            let html = '';

            // 如果未同意 TOS，只顯示同意按鈕與刪除按鈕
            if (!tosAccepted) {
                html += '<div class="more-dropdown-header" style="color:var(--bad);">授權設定</div>';
                html += `<label class="more-dropdown-item" style="cursor: pointer; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" onchange="setTosAccepted(this.checked)" ${tosAccepted ? 'checked' : ''} style="width: 16px; height: 16px;">
                    <span style="flex:1;">✅ 我已閱讀並同意服務條款與隱私權</span>
                </label>`;

                html += `<button class="more-dropdown-item" onclick="window.open('privacy.html', '_blank'); closeAllDropdowns();">
                    <span class="item-icon">📄</span> 隱私權政策 (Privacy Policy)
                </button>`;
                html += `<button class="more-dropdown-item" onclick="window.open('tos.html', '_blank'); closeAllDropdowns();">
                    <span class="item-icon">📜</span> 服務條款 (Terms of Service)
                </button>`;

                html += '<div class="more-dropdown-divider"></div>';
                html += '<div class="more-dropdown-header" style="color:var(--bad);">危險操作</div>';
                html += `<button class="more-dropdown-item" onclick="deleteAllDataFlow(); closeAllDropdowns();" style="color:var(--bad);">
                    <span class="item-icon">🗑️</span> 刪除所有資料 (Remove all my data)
                </button>`;
                dropdown.innerHTML = html;
                return;
            }

            html += '<div class="more-dropdown-header">儲存模式</div>';

            // Local only
            html += `<button class="more-dropdown-item ${mode === 'local' ? 'active' : ''}" onclick="switchMode('local')">
                <span class="item-icon">📂</span> 僅使用本機 (Local Only)
            </button>`;

            // Drive only (requires login)
            if (isLoggedIn) {
                html += `<button class="more-dropdown-item ${mode === 'drive' ? 'active' : ''}" onclick="switchMode('drive')">
                    <span class="item-icon">☁️</span> 僅使用 Google Drive
                </button>`;
                html += `<button class="more-dropdown-item ${mode === 'both' ? 'active' : ''}" onclick="switchMode('both')">
                    <span class="item-icon">🔄</span> 本機與雲端同步 (Sync Both)
                </button>`;
            }

            html += '<div class="more-dropdown-divider"></div>';
            html += '<div class="more-dropdown-header">檔案操作</div>';

            html += `<button class="more-dropdown-item" onclick="exportToLocalFile(); closeAllDropdowns();">
                <span class="item-icon">💾</span> 匯出到本機檔案
            </button>`;
            html += `<button class="more-dropdown-item" onclick="importFromLocalFile(); closeAllDropdowns();">
                <span class="item-icon">📂</span> 從本機檔案匯入
            </button>`;

            // Import from Google Drive (manual, doesn't change mode)
            if (isLoggedIn) {
                html += `<button class="more-dropdown-item" onclick="importFromDrive(); closeAllDropdowns();">
                    <span class="item-icon">☁️</span> 從 Google Drive 匯入
                </button>`;
            }

            // Divider + change save path
            html += '<div class="more-dropdown-divider"></div>';
            html += '<div class="more-dropdown-header">儲存路徑</div>';

            // Local path — show status based on mode
            const localActive = (mode === 'local' || mode === 'both');
            html += `<div class="more-dropdown-item" style="cursor:default; font-size:0.88rem;">
                <span class="item-icon">💻</span> 本機儲存 <span style="color:#999; font-size:0.78rem;">(無法更改路徑)</span>
            </div>`;

            if (isLoggedIn) {
                html += `<button class="more-dropdown-item" onclick="openDrivePicker(); closeAllDropdowns();">
                    <span class="item-icon">📁</span> 更換 Google Drive 路徑
                </button>`;
            }

            // Legal links
            html += '<div class="more-dropdown-divider"></div>';
            html += '<div class="more-dropdown-header">法規與條款</div>';
            html += `<label class="more-dropdown-item" style="cursor: pointer; display: flex; align-items: center; gap: 8px; font-weight: bold;">
                <input type="checkbox" onchange="setTosAccepted(this.checked)" checked style="width: 16px; height: 16px;">
                <span style="flex:1; color: var(--primary);">✅ 已同意服務條款與隱私權</span>
            </label>`;
            html += `<button class="more-dropdown-item" onclick="window.open('privacy.html', '_blank'); closeAllDropdowns();">
                <span class="item-icon">📄</span> 隱私權政策 (Privacy Policy)
            </button>`;
            html += `<button class="more-dropdown-item" onclick="window.open('tos.html', '_blank'); closeAllDropdowns();">
                <span class="item-icon">📜</span> 服務條款 (Terms of Service)
            </button>`;

            // Danger zone
            html += '<div class="more-dropdown-divider"></div>';
            html += '<div class="more-dropdown-header" style="color:var(--bad);">危險操作</div>';
            html += `<button class="more-dropdown-item" onclick="deleteAllDataFlow(); closeAllDropdowns();" style="color:var(--bad);">
                <span class="item-icon">🗑️</span> 刪除所有資料 (Remove all my data)
            </button>`;

            dropdown.innerHTML = html;
        }

        function updateMoreDropdowns() {
            ['welcome-more-dropdown', 'tree-more-dropdown'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.classList.contains('show')) {
                    buildMoreDropdown(id);
                }
            });
        }

        function closeAllDropdowns() {
            document.querySelectorAll('.more-dropdown').forEach(d => d.classList.remove('show'));
        }

        function switchMode(newMode) {
            if (newMode === 'drive' && !currentUser) {
                showToast('⚠️ 請先登入 Google 帳戶', 'error');
                return;
            }
            setStorageMode(newMode);
            const labels = { local: '📂 僅本機', drive: '☁️ 僅雲端', both: '🔄 本機 + 雲端同步' };
            showToast(`已切換為：${labels[newMode]}`, 'success');
            closeAllDropdowns();

            // If switching to both or drive and we have tree data, sync immediately
            if ((newMode === 'both' || newMode === 'drive') && hasInitialized && currentUser && currentUser.hasDriveFile) {
                syncToDrive('switchMode');
            }
            // If switching to local or both, save to local
            if (newMode === 'local' || newMode === 'both') {
                saveToLocal();
            }
        }

        async function deleteAllDataFlow() {
            const html = `
                <div style="text-align:left; padding-top: 10px;">
                    <p style="font-size: 1rem; margin-bottom: 10px; color: var(--bad);">警告：這將會清除您在此網站上的所有帳號資料與設定，且無法還原。</p>
                    <p style="font-size: 0.95rem; margin-bottom: 10px;">若確定要刪除，請在下方輸入：<br><strong style="user-select:all; color:#333; background:#f5f5f5; padding:2px 4px; border-radius:4px;">I want to remove all my data on this website</strong></p>
                    <input type="text" id="modal-delete-confirm-input" placeholder="請輸入確認文字..." style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" autocomplete="off">
                </div>
            `;
            const ok = await showModal({
                title: '🗑️ 刪除所有資料',
                message: html,
                confirmText: '確定刪除',
                cancelText: '取消',
                danger: true
            });

            if (ok) {
                const inputEl = document.getElementById('modal-delete-confirm-input');
                if (!inputEl) return;
                const inputVal = inputEl.value.trim();

                if (inputVal !== 'I want to remove all my data on this website') {
                    showToast('⚠️ 輸入的確認文字不正確，刪除已取消', 'error');
                    return;
                }

                // Call backend if logged in
                if (currentUser) {
                    try {
                        await fetch(API_BASE + '/api/auth/me', {
                            method: 'DELETE',
                            headers: authHeaders()
                        });
                    } catch (err) {
                        console.error('Delete account error', err);
                    }
                }

                // Clear everything locally
                localStorage.clear();

                showToast('✅ 成功刪除所有資料 (Successfully removed all your data)', 'success');

                // Reset state
                setTimeout(() => {
                    location.reload();
                }, 1500);
            }
        }

        // =========================================================================
        // Page Init
        // =========================================================================
        handleTosUI();
        checkAuth();
        initApp();
    