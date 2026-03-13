/**
 * Habit Helper - Brain Behavior Tree
 * Habit Loop Canvas Logic (Cue -> Craving -> Response -> Reward)
 */

// =========================================================================
// Global Variables & State
// =========================================================================
let habitGraph = { nodes: [], edges: [] };
let scorecardData = { identity: "", items: [] };
let currentNodeId = null, currentTokens = [], draggedTokenId = null;
let hasInitialized = false;
let currentUser = null;
const API_BASE = 'https://addiction-murex.vercel.app';

// Multiplier for long-term CP influence
let ltMultiplier = parseFloat(localStorage.getItem('brain_lt_multiplier')) || 0.1;

// Storage keys
const STORAGE_KEY_TREE = 'brain_tree_data';
const STORAGE_KEY_MODE = 'brain_storage_mode';
const STORAGE_KEY_INIT = 'brain_has_initialized';
const STORAGE_KEY_SAVE_DATE = 'brain_last_save_date';

// =========================================================================
// Initialization & Navigation
// =========================================================================
function generateId() { return Math.random().toString(36).substr(2, 9); }

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
    
    if (viewId === 'view-tree' || viewId === 'view-file-settings' || viewId === 'view-scorecard') { 
        document.body.style.overflow = 'hidden'; 
    } else { 
        document.body.style.overflow = 'auto'; 
    }
    
    if (viewId === 'view-file-settings' && typeof initFileSettings === 'function') initFileSettings();
    if (viewId === 'view-scorecard') initScorecardView();
}

function initApp() {
    checkAuth();
    handleTosUI();
}

function initFirstAction() {
    if (!getTosAccepted()) return showToast("⚠️ 請先勾選同意隱私權政策與服務條款！", "error");
    let demandInput = document.getElementById('init-demand').value.trim();
    let actionInput = document.getElementById('init-action').value.trim();
    if (!demandInput || !actionInput) return showToast("請完整填寫需求與行動！", "error");

    habitGraph = { nodes: [], edges: [] };
    let humanId = generateId();
    let cueId = generateId();
    let cravingId = generateId();
    let resId = generateId();
    
    habitGraph.nodes.push({ id: humanId, text: scorecardData.identity || '我本人', stage: 'human', x: 0, y: 0, tokens: [], cp: 0, isNew: true });
    habitGraph.nodes.push({ id: cueId, text: demandInput, stage: 'cue', x: 0, y: 0, tokens: [], cp: 0, isNew: true });
    habitGraph.nodes.push({ id: cravingId, text: '想要改變現狀', stage: 'craving', x: 0, y: 0, tokens: [], cp: 0, isNew: true });
    habitGraph.nodes.push({ id: resId, text: actionInput, stage: 'response', x: 0, y: 0, tokens: [], cp: 0, isNew: true });
    
    habitGraph.edges.push({ id: generateId(), from: humanId, to: cueId });
    habitGraph.edges.push({ id: generateId(), from: cueId, to: cravingId });
    habitGraph.edges.push({ id: generateId(), from: cravingId, to: resId });

    hasInitialized = true;
    document.getElementById('btn-back-tree').style.display = 'none';
    openEditor(resId);
}

// =========================================================================
// Habit Loop Canvas Rendering & Interaction
// =========================================================================
function renderHabitCanvas() {
    const stages = ['human', 'cue', 'craving', 'response', 'reward'];
    stages.forEach(stage => {
        const container = document.getElementById('nodes-' + stage);
        if (container) container.innerHTML = '';
    });

    habitGraph.nodes.forEach(node => {
        let el = document.createElement('div');
        el.className = 'habit-node';
        el.id = 'node_' + node.id;
        
        el.onmousedown = (e) => {
            if (e.target.closest('.node-delete-x') || e.target.closest('.edge-drag-handle') || e.target.closest('.node-add-linked')) return;
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
        let cpStr = (typeof node.cp === 'number') ? `<div style="font-size:0.85rem; color:${cpColor}; font-weight:bold; margin-top:5px;">CP: ${node.cp.toFixed(2)}</div>` : '';
        
        let hasOutgoing = habitGraph.edges.some(e => e.from === node.id);
        let loopStopHtml = '';
        if (!hasOutgoing && node.stage !== 'reward') {
            loopStopHtml = `<div style="position:absolute; right:-25px; top:50%; transform:translateY(-50%); background:var(--bad); color:white; padding:4px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold; z-index:4; cursor:help;" title="這裡迴圈中斷了 (Loop Stopped)">🛑 斷鏈</div>`;
        }
        
        let addBtnHtml = '';
        if (node.stage !== 'reward') {
            addBtnHtml = `<div class="node-add-linked" onclick="addLinkedNode('${node.id}', '${node.stage}', '${node.text}', event)" style="position:absolute; bottom:-12px; left:50%; transform:translateX(-50%); width:24px; height:24px; background:var(--primary); color:white; border-radius:50%; line-height:24px; text-align:center; font-weight:bold; cursor:pointer; font-size:16px; box-shadow:0 2px 4px rgba(0,0,0,0.2); z-index:5;" title="往下一個階段新增並連結">+</div>`;
        }
        
        el.innerHTML = `<span class="node-delete-x" onclick="deleteHabitNode('${node.id}', event)">✕</span>
                        <div class="node-content-text">${node.text}</div>${cpStr}${loopStopHtml}${addBtnHtml}
                        <div class="edge-drag-handle" title="按住拖曳連結" onmousedown="startEdgeDrag('${node.id}', event)"></div>`;
        
        let container = document.getElementById('nodes-' + node.stage);
        if(container) container.appendChild(el);
    });

    requestAnimationFrame(drawEdges);
}

async function addLinkedNode(sourceId, sourceStage, sourceText, event) {
    if(event) event.stopPropagation();
    
    const stageFlow = { 'human': 'cue', 'cue': 'craving', 'craving': 'response', 'response': 'reward' };
    const nextStage = stageFlow[sourceStage];
    if (!nextStage) return; // Reward has no next stage
    
    const stageTranslation = { 'human':'身分', 'cue':'提示', 'craving':'渴望', 'response':'回應', 'reward':'獎賞' };
    
    let text = await showModal({
        title: `➕ 新增連結節點`,
        message: `Now [<strong>${sourceText}</strong>] [${stageTranslation[sourceStage]}], what you want to link [${stageTranslation[nextStage]}]?`,
        inputPlaceholder: `輸入下一個階段的名稱...`,
        confirmText: '新增並連結'
    });
    
    if (text && text.trim()) {
        const newId = generateId();
        habitGraph.nodes.push({ id: newId, text: text.trim(), stage: nextStage, x: 0, y: 0, tokens: [], cp: 0, isNew: true });
        habitGraph.edges.push({ id: generateId(), from: sourceId, to: newId });
        renderHabitCanvas();
        syncToDrive('addLinkedNode');
    }
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
        message: `確定要刪除「<strong>${node.text}</strong>」嗎？`,
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

// =========================================================================
// Edge Rendering & Drag-and-Drop
// =========================================================================
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
        const fromHandle = fromEl.querySelector('.edge-drag-handle');
        const handleRect = fromHandle ? fromHandle.getBoundingClientRect() : fromEl.getBoundingClientRect();

        const startX = (handleRect.left + handleRect.width/2 - svgRect.left) / scale;
        const startY = (handleRect.top + handleRect.height/2 - svgRect.top) / scale;
        
        const currentX = (e.clientX - svgRect.left) / scale;
        const currentY = (e.clientY - svgRect.top) / scale;

        const d = `M ${startX} ${startY} Q ${startX + (currentX-startX)/2} ${startY}, ${currentX} ${currentY}`;
        movingEdgeLine.setAttribute('d', d);
    };

    const endEdgeDrag = (e) => {
        window.removeEventListener('mousemove', updateMovingEdge);
        window.removeEventListener('mouseup', endEdgeDrag);
        if(movingEdgeLine) { movingEdgeLine.remove(); movingEdgeLine = null; }
        isEdgeDragging = false;

        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        const targetNodeEl = elements.find(el => el.classList && el.classList.contains('habit-node'));
        if (targetNodeEl) {
            const toId = targetNodeEl.id.replace('node_', '');
            if (toId !== edgeDragFromId) {
                const fromNode = habitGraph.nodes.find(n => n.id === edgeDragFromId);
                const toNode = habitGraph.nodes.find(n => n.id === toId);
                
                if (fromNode && toNode) {
                    const validFlows = { 'human': 'cue', 'cue': 'craving', 'craving': 'response', 'response': 'reward' };
                    if (validFlows[fromNode.stage] !== toNode.stage) {
                        showToast(`❌ 必須按照順序連結：${fromNode.stage} 不能直接連到 ${toNode.stage}`, 'error');
                    } else {
                        const exists = habitGraph.edges.find(edge => edge.from === edgeDragFromId && edge.to === toId);
                        if(!exists) {
                            habitGraph.edges.push({ id: generateId(), from: edgeDragFromId, to: toId });
                            renderHabitCanvas();
                            syncToDrive('addEdge');
                        }
                    }
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
        message: `確定要刪除這條連結嗎？`,
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
    svg.innerHTML = ''; 
    
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `<marker id="arrowhead" markerWidth="10" markerHeight="7" 
        refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--line-color)" />
    </marker>
    <marker id="arrowhead-hover" markerWidth="10" markerHeight="7" 
        refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill="var(--bad)" />
    </marker>`;
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
        
        const endX = (toRect.left - svgRect.left) / scale;
        const endY = (toRect.top + toRect.height/2 - svgRect.top) / scale;

        const dx = endX - startX;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'habit-edge-path');
        const d = `M ${startX} ${startY} C ${startX + Math.max(100, dx/2)} ${startY}, ${endX - Math.max(50, dx/2)} ${endY}, ${endX} ${endY}`;
        path.setAttribute('d', d);
        path.setAttribute('marker-end', 'url(#arrowhead)');
        
        path.onmouseover = () => path.setAttribute('marker-end', 'url(#arrowhead-hover)');
        path.onmouseout = () => path.setAttribute('marker-end', 'url(#arrowhead)');
        path.onclick = (e) => deleteHabitEdge(edge.id, e);
        
        svg.appendChild(path);
    });
}

window.addEventListener('resize', () => { 
    const treeView = document.getElementById('view-tree');
    if(treeView && treeView.classList.contains('active')) requestAnimationFrame(drawEdges); 
});

// =========================================================================
// View 2: Editor Logic (CP Matrix)
// =========================================================================
function openEditor(nodeId) {
    currentNodeId = nodeId; currentTokens = [];
    const alertBox = document.getElementById('alert-box');
    if (alertBox) alertBox.style.display = 'none';
    if (hasInitialized) {
        const backBtn = document.getElementById('btn-back-tree');
        if (backBtn) backBtn.style.display = 'inline-block';
    }

    ['zone-cue', 'zone-craving', 'zone-response', 'zone-reward', 'token-dock'].forEach(id => {
        const el = document.getElementById(id);
        if(el) Array.from(el.children).forEach(c => { if (c.classList.contains('cp-token')) c.remove(); });
    });
    checkDockHint();

    if (nodeId !== null) {
        let node = habitGraph.nodes.find(n => n.id === nodeId);
        if (node) {
            const titleEl = document.getElementById('editor-title');
            const nameEl = document.getElementById('action-name');
            if (titleEl) titleEl.innerText = `編輯節點：${node.text}`;
            if (nameEl) nameEl.value = node.text;
            currentTokens = JSON.parse(JSON.stringify(node.tokens || []));
            currentTokens.forEach(t => renderToken(t));
        }
    }
    updateScores();
    switchView('view-editor');
}

function goToTree() { initApp(); }

function toggleScoreSign() {
    const input = document.getElementById('cp-score');
    if (!input) return;
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

    document.getElementById('cp-name').value = ''; 
    document.getElementById('cp-score').value = '';
    updateScores();
}

function renderToken(token) {
    let el = document.createElement('div');
    el.className = `cp-token ${token.timeType === 'st' ? 'st-token' : 'lt-token'}`;
    el.id = token.id; el.draggable = true;
    el.innerHTML = `<span>${token.name} (${token.score > 0 ? '+' + token.score : token.score})</span><span class="token-del" onclick="deleteToken('${token.id}')">✖</span>`;

    el.addEventListener('dragstart', () => { draggedTokenId = token.id; setTimeout(() => el.style.opacity = '0.5', 0); });
    el.addEventListener('dragend', () => el.style.opacity = '1');

    el.addEventListener('touchstart', (e) => {
        if (e.touches.length > 1) return;
        draggedTokenId = token.id;
        el.style.opacity = '0.5';
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

    const zone = document.getElementById(token.stage === 'dock' ? 'token-dock' : `zone-${token.stage}`);
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
    if (ev.preventDefault) ev.preventDefault(); 
    if(ev.currentTarget && ev.currentTarget.classList) ev.currentTarget.classList.remove('dragover');
    if (draggedTokenId !== null) {
        const dropEl = document.getElementById(draggedTokenId);
        if(ev.currentTarget && ev.currentTarget.appendChild && dropEl) ev.currentTarget.appendChild(dropEl);
        let tokenData = currentTokens.find(t => t.id === draggedTokenId);
        if (tokenData) tokenData.stage = targetStage;
        draggedTokenId = null;
        checkDockHint();
        updateScores();
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
    const nameEl = document.getElementById('action-name');
    if (!nameEl) return;
    let actionNameInput = nameEl.value.trim();
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
            alertBox.innerHTML = `🚨【系統防護攔截】這是一個「好習慣 (長期 >= 0)」！<br>
        你的短期 CP 目前是 ${scores.st}。<br>
        大腦是短視的，如果短期痛苦沒有獎勵，大腦就會放棄！<br>
        👉 <b>請強制加入「短期的正面 CP (獎賞)」，讓短期 CP > 0！</b>`;
            alertBox.style.display = 'block';
            return;
        } else if (!isGoodHabit && scores.st >= 0) {
            alertBox.className = 'alert-box';
            alertBox.innerHTML = `🚨【系統防護攔截】這是一個「壞習慣 (長期 < 0)」！<br>
        你的短期 CP 目前是 ${scores.st}。<br>
        只要短期 CP 還是正的，你的大腦就會覺得性價比很高而繼續做！<br>
        👉 <b>請強制加入「短期的負面 CP (摩擦力/懲罰)」，讓短期 CP < 0！</b>`;
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

// =========================================================================
// Multiplier & Sleep Logic
// =========================================================================
function openSleepSliderModal() {
    doSleepSliderFlow();
}

async function doSleepSliderFlow() {
    const html = `
        <div style="text-align:center; padding-top: 10px;">
            <p style="font-size: 1.1rem; margin-bottom: 20px;">最近 7 天，你睡最少的那天睡了幾個小時？</p>
            <input type="range" id="modal-sleep-range" min="0" max="14" step="0.5" value="7" oninput="document.getElementById('modal-sleep-val').innerText = this.value + ' 小時'" style="width: 80%; cursor: pointer;">
            <p id="modal-sleep-val" style="font-size: 1.5rem; font-weight: bold; color: var(--primary); margin: 15px 0;">7 小時</p>
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

async function checkDailySleepPrompt() {
    const today = new Date().toISOString().slice(0, 10);
    const lastSleepDate = localStorage.getItem('brain_sleep_date');

    if (lastSleepDate !== today) {
        await doSleepSliderFlow();
        localStorage.setItem('brain_sleep_date', today);
    }
}

function setSleepFromHours(hours, choice) {
    const isStayedUp = (choice === 'yes') || (hours < 6);
    ltMultiplier = isStayedUp ? 0.01 : 0.2;
    localStorage.setItem('brain_lt_multiplier', ltMultiplier.toString());

    const multEl = document.getElementById('lt-multiplier');
    if (multEl) multEl.textContent = `× ${ltMultiplier}`;

    updateScores();
    renderHabitCanvas();

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
// Storage & Drive Persistence
// =========================================================================
function getStorageMode() {
    return localStorage.getItem(STORAGE_KEY_MODE) || 'local';
}
function setStorageMode(mode) {
    localStorage.setItem(STORAGE_KEY_MODE, mode);
    updateMoreDropdowns();
}

function saveToLocal() {
    try {
        const data = JSON.stringify({
            habitGraph: serializeTreeForSync(),
            scorecardData: scorecardData,
            hasInitialized,
            savedAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEY_TREE, data);
        localStorage.setItem(STORAGE_KEY_INIT, hasInitialized ? '1' : '0');
    } catch (e) {
        showToast('⚠️ 本機儲存空間不足，請清理瀏覽器資料', 'error');
    }
}

function loadFromLocal() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TREE);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (data && data.scorecardData) {
            scorecardData = data.scorecardData;
        }
        if (data && data.habitGraph) return data.habitGraph;
    } catch (e) { /* ignore parse errors */ }
    return null;
}

function restoreTreeFromSerialized(saved) {
    if (!saved || !saved.nodes) return false;
    habitGraph = { nodes: saved.nodes || [], edges: saved.edges || [] };
    hasInitialized = true;
    return true;
}

function serializeTreeForSync() {
    return habitGraph;
}

function authHeaders() {
    const token = localStorage.getItem('brain_session_token');
    const headers = {};
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
}

function loginGoogle() { window.location.href = API_BASE + '/api/auth/google'; }
function logoutGoogle() {
    localStorage.removeItem('brain_session_token');
    currentUser = null;
    location.reload();
}

async function checkAuth() {
    const token = localStorage.getItem('brain_session_token') || new URLSearchParams(window.location.search).get('token');
    if (token) {
        localStorage.setItem('brain_session_token', token);
        if (window.location.search.includes('token')) history.replaceState({}, '', window.location.pathname);
        try {
            const res = await fetch(API_BASE + '/api/auth/me', { headers: authHeaders() });
            const data = await res.json();
            if (data.loggedIn) currentUser = data.user;
        } catch (e) { }
    }
    updateAuthUI();
    if (currentUser && currentUser.hasDriveFile) loadFromDrive();
    else if (localStorage.getItem('brain_tree_data')) {
        restoreTreeFromSerialized(JSON.parse(localStorage.getItem('brain_tree_data')));
        // Simplified init sequence
        if (!hasInitialized) switchView('view-welcome');
        else {
            renderHabitCanvas();
            switchView('view-tree');
            resetCanvasView();
            checkDailySleepPrompt();
        }
    } else {
        hideLoadingOverlay();
        switchView('view-welcome');
    }
}

function updateAuthUI() {
    const loggedOut = document.getElementById('logged-out');
    const loggedIn = document.getElementById('logged-in');
    if (currentUser) {
        if (loggedOut) loggedOut.style.display = 'none';
        if (loggedIn) {
            loggedIn.style.display = 'flex';
            const nameEl = document.getElementById('user-name');
            const avatarEl = document.getElementById('user-avatar');
            if (nameEl) nameEl.textContent = currentUser.name;
            if (avatarEl) avatarEl.src = currentUser.picture;
        }
    } else {
        if (loggedOut) loggedOut.style.display = 'block';
        if (loggedIn) loggedIn.style.display = 'none';
    }
}

// =========================================================================
// Legal & Loading Utilities
// =========================================================================
function getTosAccepted() { return localStorage.getItem('brain_tos_accepted') === 'true'; }
function setTosAccepted(accepted) {
    localStorage.setItem('brain_tos_accepted', accepted ? 'true' : 'false');
    handleTosUI();
    if (currentUser) {
        fetch(API_BASE + '/api/auth/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ tosAccepted: accepted })
        }).catch(err => { });
    }
}
function handleTosCheckboxChange(e) { 
    const accepted = typeof e === 'boolean' ? e : e.target.checked;
    setTosAccepted(accepted); 
}
function handleTosUI() {
    const accepted = getTosAccepted();
    const overlay = document.getElementById('tos-block-overlay');
    const welcomeView = document.getElementById('view-welcome');
    const isWelcome = welcomeView && welcomeView.classList.contains('active');
    
    if (overlay) {
        // Overlay logic: show if not accepted, UNLESS we are on welcome page and NOT logged in
        if (accepted || (isWelcome && !currentUser)) {
            overlay.classList.remove('show');
        } else {
            overlay.classList.add('show');
        }
    }
    const checkbox = document.getElementById('tos-checkbox');
    if (checkbox) checkbox.checked = accepted;
}

function updateLoadingStatus(text) { 
    const el = document.getElementById('loading-status');
    if (el) el.textContent = text; 
}
function hideLoadingOverlay() { 
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.add('hidden'); 
}

function showToast(message, type = 'warning') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = (type === 'error' ? '🚨 ' : type === 'success' ? '✅ ' : '💡 ') + message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

function showModal(opts) {
    return new Promise(resolve => {
        const overlay = document.getElementById('modal-overlay');
        const titleEl = document.getElementById('modal-title');
        const msgEl = document.getElementById('modal-message');
        const inputEl = document.getElementById('modal-input');
        const actionsEl = document.getElementById('modal-actions');

        if (!overlay) return resolve(null);

        titleEl.textContent = opts.title || '';
        msgEl.innerHTML = opts.message || '';
        if (inputEl) {
            inputEl.style.display = opts.inputPlaceholder ? 'block' : 'none';
            if (opts.inputPlaceholder) {
                inputEl.placeholder = opts.inputPlaceholder;
                inputEl.value = opts.inputDefault || '';
            }
        }

        function close(val) { overlay.classList.remove('show'); resolve(val); }

        actionsEl.innerHTML = '';
        if (opts.buttons) {
            opts.buttons.forEach(b => {
                const btn = document.createElement('button');
                btn.className = b.className || 'primary';
                btn.textContent = b.text;
                btn.onclick = () => close(b.value);
                actionsEl.appendChild(btn);
            });
        } else {
            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'secondary';
            cancelBtn.textContent = opts.cancelText || '取消';
            cancelBtn.onclick = () => close(null);
            actionsEl.appendChild(cancelBtn);

            const confirmBtn = document.createElement('button');
            confirmBtn.className = 'primary';
            confirmBtn.textContent = opts.confirmText || '確定';
            confirmBtn.onclick = () => close(opts.inputPlaceholder ? inputEl.value : true);
            actionsEl.appendChild(confirmBtn);
        }
        overlay.classList.add('show');
    });
}

async function syncToDriveInternal(triggerAction) {
    if (!currentUser || !currentUser.hasDriveFile) return false;
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

async function syncToDrive(triggerAction, isFromImportDiff = false) {
    const mode = getStorageMode();
    const today = new Date().toISOString().slice(0, 10);
    const lastSaveDate = localStorage.getItem(STORAGE_KEY_SAVE_DATE);
    const needNewFile = (lastSaveDate && today !== lastSaveDate) || isFromImportDiff;

    if (mode === 'local' || mode === 'both') {
        saveToLocal();
    }

    if ((mode === 'drive' || mode === 'both') && currentUser && currentUser.hasDriveFile) {
        const syncDot = document.getElementById('sync-dot');
        if (syncDot) {
            syncDot.className = 'sync-indicator syncing';
            syncDot.title = '同步中...';
        }
        try {
            if (needNewFile) {
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

    if (mode === 'local') {
        saveToLocal();
    }
    localStorage.setItem(STORAGE_KEY_SAVE_DATE, today);
}

// =========================================================================
// File Export / Import Logic (Local)
// =========================================================================
function exportToLocalFile() {
    const data = JSON.stringify({
        exportedAt: new Date().toISOString(),
        habitGraph: serializeTreeForSync(),
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
    const input = document.getElementById('local-file-input');
    if (input) input.click();
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
            const importedTree = parsed.habitGraph || parsed.treeData || parsed.humanTree || parsed;
            if (!importedTree || (!importedTree.nodes && !importedTree.children)) {
                showToast('⚠️ 檔案格式不正確，無法匯入', 'error');
                return;
            }
            
            const normalizedTree = (importedTree.children) ? convertOldTreeToGraph(importedTree) : importedTree;
            const currentTree = serializeTreeForSync();
            const currentStr = JSON.stringify(currentTree);
            const importedStr = JSON.stringify(normalizedTree);
            
            if (hasInitialized && currentStr !== importedStr) {
                showConflictDialog(currentTree, normalizedTree, '🖥️ 目前網頁資料', '📂 匯入的檔案', 'importLocal');
            } else {
                restoreTreeFromSerialized(normalizedTree);
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
    event.target.value = ''; 
}

function convertOldTreeToGraph(oldTree) {
    let graph = { nodes: [], edges: [] };
    if (!oldTree || !oldTree.children) return graph;
    
    oldTree.children.forEach(demand => {
        let demandId = demand.id || generateId();
        graph.nodes.push({ id: demandId, text: demand.name, stage: 'cue', tokens: [], st: 0, lt: 0, cp: 0 });
        
        (demand.actions || []).forEach(action => {
            let actionId = action.id || generateId();
            graph.nodes.push({ 
                id: actionId, text: action.name, stage: 'response', 
                tokens: action.tokens || [], st: action.st || 0, lt: action.lt || 0, cp: action.cp || 0 
            });
            graph.edges.push({ id: generateId(), from: demandId, to: actionId });
        });
    });
    return graph;
}

// =========================================================================
// Drive Browse / Import 
// =========================================================================
async function importFromDrive() {
    if (!currentUser) {
        showToast('⚠️ 請先登入 Google', 'error');
        return;
    }

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
                const driveData = loadData.data.treeData || loadData.data.habitGraph || loadData.data;
                const normalized = (driveData.children) ? convertOldTreeToGraph(driveData) : driveData;

                const currentTree = serializeTreeForSync();
                const currentStr = JSON.stringify(currentTree);
                const driveStr = JSON.stringify(normalized);
                
                if (hasInitialized && currentStr !== driveStr) {
                    showConflictDialog(currentTree, normalized, '🖥️ 目前網頁資料', '☁️ Google Drive 檔案', 'importDrive');
                } else {
                    restoreTreeFromSerialized(normalized);
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
// Conflict Resolution UI
// =========================================================================
function showConflictDialog(local, remote, localTitle, remoteTitle, source) {
    const overlay = document.getElementById('conflict-overlay');
    document.getElementById('conflict-local-title').innerText = localTitle;
    document.getElementById('conflict-remote-title').innerText = remoteTitle;
    document.getElementById('conflict-local-preview').innerHTML = treePreviewHTML(local);
    document.getElementById('conflict-remote-preview').innerHTML = treePreviewHTML(remote);

    const btnLocal = document.getElementById('btn-keep-local');
    const btnRemote = document.getElementById('btn-keep-remote');

    const newBtnLocal = btnLocal.cloneNode(true);
    const newBtnRemote = btnRemote.cloneNode(true);
    btnLocal.parentNode.replaceChild(newBtnLocal, btnLocal);
    btnRemote.parentNode.replaceChild(newBtnRemote, btnRemote);

    newBtnLocal.onclick = () => resolveConflict('local', local, remote, source);
    newBtnRemote.onclick = () => resolveConflict('remote', local, remote, source);

    overlay.classList.add('show');
    if(source === 'auto') hideLoadingOverlay();
}

function treePreviewHTML(graph) {
    if (!graph || !graph.nodes || graph.nodes.length === 0) return '<div style="color:#999;">（無資料）</div>';
    let html = '';
    graph.nodes.slice(0, 10).forEach(n => {
        const cp = typeof n.cp === 'number' ? n.cp.toFixed(2) : '?';
        html += `<div class="action-item">[${n.stage.toUpperCase()}] ${n.text} (CP: ${cp})</div>`;
    });
    if (graph.nodes.length > 10) html += `<div style="text-align:center; color:#888; font-size:0.8rem; margin-top:5px;">...還有 ${graph.nodes.length - 10} 個節點</div>`;
    return html;
}

function resolveConflict(choice, local, remote, source) {
    const overlay = document.getElementById('conflict-overlay');
    overlay.classList.remove('show');
    const selected = (choice === 'local') ? local : remote;
    restoreTreeFromSerialized(selected);
    saveToLocal();
    initApp();
    showToast(`✅ 已選擇 ${choice === 'local' ? '目前網頁資料' : '外部載入資料'}`, 'success');

    if (source === 'auto' || source === 'importLocal' || source === 'importDrive') {
        syncToDrive('resolveConflict', true);
    }
}

// =========================================================================
// More Options (☰) Menu logic
// =========================================================================
function toggleMoreMenu(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
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

document.addEventListener('click', (e) => {
    if (!e.target.closest('.more-options-wrapper')) {
        document.querySelectorAll('.more-dropdown').forEach(d => d.classList.remove('show'));
    }
});

function buildMoreDropdown(dropdownId) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;
    const mode = getStorageMode();
    const isLoggedIn = !!currentUser;
    const tosAccepted = getTosAccepted();

    let html = '';

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

    // Simplified 3-item menu as per plan
    html += '<div class="more-dropdown-header">主要功能</div>';
    
    html += `<button class="more-dropdown-item" onclick="switchView('view-scorecard'); closeAllDropdowns();">
        <span class="item-icon">🎯</span> 習慣計分卡 (指差確認)
    </button>`;

    html += `<button class="more-dropdown-item" onclick="switchView('view-file-settings'); closeAllDropdowns();">
        <span class="item-icon">📁</span> 檔案自動化設定
    </button>`;

    html += `<button class="more-dropdown-item" onclick="importFromLocalFile(); closeAllDropdowns();">
        <span class="item-icon">📥</span> 手動匯入 (Import)
    </button>`;

    html += `<button class="more-dropdown-item" onclick="exportToLocalFile(); closeAllDropdowns();">
        <span class="item-icon">💾</span> 手動存檔 (Export)
    </button>`;

    html += '<div class="more-dropdown-divider"></div>';
    html += '<div class="more-dropdown-header">法規與條款</div>';
    html += `<button class="more-dropdown-item" onclick="window.open('privacy.html', '_blank'); closeAllDropdowns();">
        <span class="item-icon">📄</span> 隱私權政策 (Privacy Policy)
    </button>`;
    html += `<button class="more-dropdown-item" onclick="window.open('tos.html', '_blank'); closeAllDropdowns();">
        <span class="item-icon">📜</span> 服務條款 (Terms of Service)
    </button>`;

    html += '<div class="more-dropdown-divider"></div>';
    html += '<div class="more-dropdown-header" style="color:var(--bad);">危險操作</div>';
    html += `<button class="more-dropdown-item" onclick="deleteAllDataFlow(); closeAllDropdowns();" style="color:var(--bad);">
        <span class="item-icon">🗑️</span> 刪除所有資料 (Remove all data)
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

    if ((newMode === 'both' || newMode === 'drive') && hasInitialized && currentUser && currentUser.hasDriveFile) {
        syncToDrive('switchMode');
    }
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

        if (currentUser) {
            try {
                await fetch(API_BASE + '/api/auth/me', {
                    method: 'DELETE',
                    headers: authHeaders()
                });
            } catch (err) { }
        }
        localStorage.clear();
        showToast('✅ 成功刪除所有資料 (Successfully removed all your data)', 'success');
        setTimeout(() => { location.reload(); }, 1500);
    }
}

// =========================================================================
// Folder Picker Support
// =========================================================================
async function openDrivePicker(modeStr = 'load') {
    if (!currentUser) {
        showToast('⚠️ 請先登入 Google', 'error');
        return;
    }

    const overlay = document.getElementById('modal-overlay');
    const title = (modeStr === 'load') ? '📂 選擇 Google Drive 載入目錄' : '📁 設定 Google Drive 儲存目錄';
    document.getElementById('modal-title').textContent = title;

    document.getElementById('modal-message').innerHTML = '<div class="picker-loading">⏳ 正在載入資料夾列表...</div>';
    document.getElementById('modal-input').style.display = 'none';
    document.getElementById('modal-actions').innerHTML = `<button class="modal-btn-cancel" onclick="document.getElementById('modal-overlay').classList.remove('show')">取消</button>`;
    overlay.classList.add('show');

    try {
        const res = await fetch(API_BASE + '/api/browse-drive?action=folders', { headers: authHeaders() });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || '載入失敗');

        const folders = data.folders || [];
        let selectedFolderId = null;
        if (modeStr === 'load') selectedFolderId = localStorage.getItem('brain_load_folder_id') || data.currentFolderId || null;
        else selectedFolderId = localStorage.getItem('brain_save_folder_id') || data.currentFolderId || null;
        
        let selectedFolderName = 'My Drive (根目錄)';

        let listHTML = '<div class="picker-list">';
        listHTML += `<div class="picker-item ${!selectedFolderId ? 'active' : ''}" data-id="">
            <span>🏠</span> <span>My Drive (根目錄)</span>
        </div>`;

        folders.forEach(f => {
            const isActive = (f.id === selectedFolderId);
            if (isActive) selectedFolderName = f.name;
            listHTML += `<div class="picker-item ${isActive ? 'active' : ''}" data-id="${f.id}">
                <span>📁</span> <span>${f.name}</span>
            </div>`;
        });
        listHTML += '</div>';

        const createHTML = `
            <div class="picker-create">
                <input type="text" id="new-folder-name" placeholder="建立新資料夾..." style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px;">
                <button class="modal-btn-primary" id="btn-create-folder" style="padding: 6px 12px; margin-left:5px;">建立</button>
            </div>
        `;

        document.getElementById('modal-message').innerHTML = listHTML + createHTML;
        document.getElementById('modal-actions').innerHTML =
            `<button class="modal-btn-cancel" id="picker-cancel">取消</button>` +
            `<button class="modal-btn-primary" id="picker-confirm">✅ 確認選擇</button>`;

        document.querySelectorAll('.picker-item').forEach(item => {
            item.addEventListener('click', () => {
                document.querySelectorAll('.picker-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                selectedFolderId = item.getAttribute('data-id');
                selectedFolderName = item.querySelector('span:nth-child(2)').textContent;
            });
        });

        document.getElementById('btn-create-folder').onclick = async () => {
            const newName = document.getElementById('new-folder-name').value.trim();
            if (!newName) { showToast('⚠️ 請輸入資料夾名稱', 'error'); return; }
            selectedFolderName = newName;
            selectedFolderId = null; 
            await doPickerConfirm(selectedFolderName);
        };

        document.getElementById('picker-cancel').onclick = () => overlay.classList.remove('show');
        document.getElementById('picker-confirm').onclick = () => doPickerConfirm(selectedFolderName);

        async function doPickerConfirm(folderName) {
            overlay.classList.remove('show');
            showToast('⏳ 正在更新儲存設定...', 'warning');
            try {
                const fileName = generateFileName();
                const reqBody = { fileName, folderName: folderName || undefined };
                if (selectedFolderId) {
                    reqBody.folderConflictStrategy = 'use_existing';
                    reqBody.existingFolderId = selectedFolderId;
                } else if (folderName && folderName !== 'My Drive (根目錄)') {
                    reqBody.folderConflictStrategy = 'create_new';
                }
                
                const createRes = await fetch(API_BASE + '/api/create-drive-file', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...authHeaders() },
                    body: JSON.stringify(reqBody),
                });
                const createData = await createRes.json();
                if (createData.success) {
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
                    updateAuthUI();
                    showToast(`☁️ 已將同步資料夾設為「${createData.folderName || '根目錄'}」`, 'success');
                } else {
                    showToast('⚠️ 設定失敗：' + (createData.error || '未知錯誤'), 'error');
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

// =========================================================================
// File Automation Settings View logic
// =========================================================================
function toggleSeparateFolders() {
    const checked = document.getElementById('setting-separate-folders').checked;
    localStorage.setItem('brain_separate_folders', checked ? 'true' : 'false');
    const saveBtn = document.getElementById('btn-save-folder');
    const saveDisplay = document.getElementById('display-save-folder');
    
    if (saveBtn) saveBtn.disabled = !checked;
    if (saveDisplay) {
        saveDisplay.innerText = checked ? (localStorage.getItem('brain_save_folder_name') || '未選擇設定') : '與載入來源相同';
    }
}

function initFileSettings() {
    const sep = localStorage.getItem('brain_separate_folders') === 'true';
    const sepToggle = document.getElementById('setting-separate-folders');
    const saveBtn = document.getElementById('btn-save-folder');
    
    if (sepToggle) sepToggle.checked = sep;
    if (saveBtn) saveBtn.disabled = !sep;
    
    const loadName = localStorage.getItem('brain_load_folder_name') || '根目錄 (My Drive)';
    const saveName = localStorage.getItem('brain_save_folder_name') || '未選擇設定';

    const loadDisp = document.getElementById('display-load-folder');
    const saveDisp = document.getElementById('display-save-folder');
    
    if (loadDisp) loadDisp.innerText = loadName;
    if (saveDisp) saveDisp.innerText = sep ? saveName : '與載入來源相同';
    
    const statusEl = document.getElementById('setting-file-status');
    if (statusEl) {
        if (currentUser) {
            statusEl.innerText = '✅ 您已連線至 Google Drive';
            statusEl.style.color = 'var(--good)';
        } else {
            statusEl.innerText = '⚠️ 請先登入 Google 帳號以使用自動化設定';
            statusEl.style.color = 'var(--bad)';
        }
    }
}

// =========================================================================
// TOS Logic
// =========================================================================
function getTosAccepted() {
    return localStorage.getItem('brain_tos_accepted') === 'true';
}

function setTosAccepted(accepted) {
    localStorage.setItem('brain_tos_accepted', accepted ? 'true' : 'false');
    if (currentUser) {
        fetch(API_BASE + '/api/auth/me', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ tosAccepted: accepted })
        }).catch(err => { });
    }
    handleTosUI();
    updateMoreDropdowns();
}
// Removed duplicate TOS functions
// =========================================================================
// Scorecard (指差確認) Logic
// =========================================================================

function initScorecardView() {
    const identInput = document.getElementById('scorecard-identity');
    if (identInput) identInput.value = scorecardData.identity || "";
    renderScorecardList();
}

function saveScorecardIdentity() {
    const identInput = document.getElementById('scorecard-identity');
    if (identInput) scorecardData.identity = identInput.value.trim();
    saveToLocal();
}

function addScorecardItem() {
    const input = document.getElementById('new-daily-action');
    const text = input.value.trim();
    if (!text) return;
    scorecardData.items.push({ id: 'sq_' + generateId(), text: text, evaluation: null });
    input.value = '';
    saveToLocal();
    renderScorecardList();
}

function evaluateScorecardItem(id, evalType) {
    const item = scorecardData.items.find(i => i.id === id);
    if(item) {
        item.evaluation = evalType;
        saveToLocal();
        renderScorecardList();
    }
}

function deleteScorecardItem(id) {
    scorecardData.items = scorecardData.items.filter(i => i.id !== id);
    saveToLocal();
    renderScorecardList();
}

function renderScorecardList() {
    const list = document.getElementById('scorecard-list');
    if (!list) return;
    list.innerHTML = '';
    
    if (scorecardData.items.length === 0) {
        list.innerHTML = '<div style="color:#999; text-align:center; padding: 20px;">尚無日常行為，請從上方新增。</div>';
        return;
    }
    
    scorecardData.items.forEach(item => {
        let evalClass = item.evaluation ? item.evaluation : '';
        const el = document.createElement('div');
        el.className = `scorecard-item ${evalClass}`;
        el.innerHTML = `
            <div style="flex: 1;">
                <div style="font-weight: bold; font-size: 1.1rem;">${item.text}</div>
            </div>
            <div class="eval-btn-group">
                <button class="eval-btn ${item.evaluation === 'good' ? 'active good' : ''}" onclick="evaluateScorecardItem('${item.id}', 'good')">+</button>
                <button class="eval-btn ${item.evaluation === 'neutral' ? 'active neutral' : ''}" onclick="evaluateScorecardItem('${item.id}', 'neutral')">=</button>
                <button class="eval-btn ${item.evaluation === 'bad' ? 'active bad' : ''}" onclick="evaluateScorecardItem('${item.id}', 'bad')">-</button>
                <button class="eval-btn" style="color:var(--bad); font-size:0.9rem; margin-left:10px; border:none;" onclick="deleteScorecardItem('${item.id}')">🗑️</button>
            </div>
        `;
        list.appendChild(el);
    });
}

// =========================================================================
// Initialization on Page Load
// =========================================================================
function generateFileName() {
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `habit-log-${ts}.json`;
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// =========================================================================
// Global Exports for HTML Attributes
// =========================================================================
window.initApp = initApp;
window.loginGoogle = loginGoogle;
window.logoutGoogle = logoutGoogle;
window.initAppWithHabit = initFirstAction;
window.addHabitNode = addHabitNode;
window.addLinkedNode = addLinkedNode;
window.deleteHabitNode = deleteHabitNode;
window.switchView = switchView;
window.goToTree = goToTree;
window.toggleMoreMenu = toggleMoreMenu;
window.handleTosCheckboxChange = handleTosCheckboxChange;
window.setTosAccepted = setTosAccepted;
window.saveScorecardIdentity = saveScorecardIdentity;
window.addScorecardItem = addScorecardItem;
window.evaluateScorecardItem = evaluateScorecardItem;
window.deleteScorecardItem = deleteScorecardItem;
window.showToast = showToast;
window.showModal = showModal;
window.saveNodeData = saveAction;
window.toggleScoreSign = toggleScoreSign;
window.createCPToken = createCPToken;
window.deleteToken = deleteToken;
window.openSleepSliderModal = openSleepSliderModal;
window.exportToLocalFile = exportToLocalFile;
window.importFromLocalFile = importFromLocalFile;
window.handleLocalFileImport = handleLocalFileImport;
window.openDrivePicker = openDrivePicker;
window.toggleSeparateFolders = toggleSeparateFolders;
window.deleteAllDataFlow = deleteAllDataFlow;
window.closeAllDropdowns = closeAllDropdowns;
