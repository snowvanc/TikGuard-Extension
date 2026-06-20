const allowedDomains = ['tiktok.com', 'tiktokglobalshop.com', 'tiktokshopglobalselling.com'];
const isAllowedDomain = allowedDomains.some(domain => window.location.hostname.includes(domain));

let rules = [];
let isPro = false;
let currentLang = 'zh';

const I18N = {
    zh: {
        tEmpty: "⚠️ 内容为空", tAI: "🤖 AI 正在优化...", tDone: "✅ 完成", tTimeout: "❌ 请求超时或网络异常",
        btnDel: "🛡️ 删除", btnAi: "✨ AI 修复", btnPolish: "✨ 润色", btnTitle: "🏆 标题", btnTags: "🏷️ 标签",
        locked: "🔒 Pro", aiMenu: "AI 助手", actPro: "请激活 Pro",
        ipAlert: "🚨 严重警告：节点 IP 发生变动！谨防关联", ipOld: "原节点:", ipNew: "新节点:", ipBtn: "我知道了，立即处理",
        geoAlertTitle: "🛑 致命关联防爆盾 (Geo-Fence)", geoSafe: "绑定安全国:", geoCurr: "当前越界节点:",
        priceWarn: "🚨 破产防呆预警：折扣力度已超 50%，请核实是否操作失误！", btnOk: "确认无误",
        trialEnd: "✨ 试用额度已用完", buyBtn: "升级 Pro 解锁无限次数", later: "等会再说", freeIpTips: "⚠️ 免费版仅提醒一次，持续守护请升级 Pro 版"
    },
    en: {
        tEmpty: "⚠️ Content empty", tAI: "🤖 AI Processing...", tDone: "✅ Done", tTimeout: "❌ Timeout or Error",
        btnDel: "🛡️ Delete", btnAi: "✨ AI Fix", btnPolish: "✨ Polish", btnTitle: "🏆 Title", btnTags: "🏷️ Tags",
        locked: "🔒 Pro", aiMenu: "AI Assistant", actPro: "Please activate Pro",
        ipAlert: "🚨 ALERT: IP Address Changed!", ipOld: "Old IP:", ipNew: "New IP:", ipBtn: "Got it",
        geoAlertTitle: "🛑 CRITICAL: Geo-Fence Mismatch!", geoSafe: "Safe Country:", geoCurr: "Current IP:",
        priceWarn: "🚨 Fat Finger Alert: Discount > 50%! Please verify.", btnOk: "It is correct",
        trialEnd: "✨ Trial limit reached", buyBtn: "Upgrade to Pro for Unlimited", later: "Later", freeIpTips: "⚠️ Free version warns once. Upgrade for 24/7 protection."
    }
};

const t = (k) => I18N[currentLang][k];

init();

function init() {
    chrome.storage.local.get(['tikguard_activation', 'tikguard_rules', 'tg_lang_pref', 'tg_ip_alert', 'tg_geo_alert'], (result) => {
        isPro = !!result.tikguard_activation;
        const pref = result.tg_lang_pref || 'auto';
        currentLang = pref === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : pref;
        rules = (result.tikguard_rules && result.tikguard_rules.length > 0) ? result.tikguard_rules : [];

        if (window.self === window.top) {
            setupInstantIPMonitor();
        }
        if (isAllowedDomain) {
            startMonitoring();
            setupContentTools();
        }

        // 🔥 取消这里的 isPro 判断，允许给免费用户弹出 1 次警告
        if (result.tg_geo_alert && (Date.now() - result.tg_geo_alert.time < 120000)) {
            showGeoAlert(result.tg_geo_alert.safe, result.tg_geo_alert.current);
        } else if (result.tg_ip_alert && (Date.now() - result.tg_ip_alert.time < 120000)) {
            showIPAlert(result.tg_ip_alert.old, result.tg_ip_alert.new);
        }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.tg_lang_pref) {
                const pref = changes.tg_lang_pref.newValue || 'auto';
                currentLang = pref === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : pref;
            }
            if (changes.tikguard_rules) rules = changes.tikguard_rules.newValue || rules;
            if (changes.tikguard_activation) isPro = !!changes.tikguard_activation.newValue;

            if (changes.tg_geo_alert && changes.tg_geo_alert.newValue) {
                showGeoAlert(changes.tg_geo_alert.newValue.safe, changes.tg_geo_alert.newValue.current);
            } else if (changes.tg_ip_alert && changes.tg_ip_alert.newValue) {
                showIPAlert(changes.tg_ip_alert.newValue.old, changes.tg_ip_alert.newValue.new);
            }
        }
    });
}

function setupContentTools() {
    document.addEventListener('mousedown', (e) => {
        if (!e.target.closest('.tg-magic-btn') && !e.target.closest('.tg-ai-panel')) {
            const oldBtn = document.getElementById('tg-magic-btn');
            if (oldBtn) oldBtn.remove();
        }
    });

    window.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;
        setTimeout(() => {
            const target = document.activeElement;
            const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
            const isRichText = target.isContentEditable || target.closest('[contenteditable="true"]');
            
            if (!isInput && !isRichText) {
                const btn = document.getElementById('tg-magic-btn');
                if (btn) btn.remove();
                return;
            }
            
            let text = isInput ? target.value.substring(target.selectionStart, target.selectionEnd).trim() : window.getSelection().toString().trim();
            if (!text) return;
            calculateAndShowWand(target, text, isInput);
        }, 50);
    }, true);
}

function setupInstantIPMonitor() {
    const triggerCheck = () => { chrome.runtime.sendMessage({ action: "force_check_ip" }); };
    window.addEventListener('online', () => setTimeout(triggerCheck, 2000));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') triggerCheck(); });
    window.addEventListener('focus', triggerCheck);
}

function smartInsert(element, text, needSelectAll) {
    try {
        element.focus();
        if (needSelectAll) {
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.select();
            else document.execCommand('selectAll', false, null);
        }

        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
            const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
            const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
            if (setter) {
                setter.call(element, text);
            } else {
                element.value = text;
            }
        } else {
            document.execCommand('insertText', false, text);
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (e) {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') element.value = text;
        else element.innerText = text;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toast") showToast(request.message);
    if (request.action === "trigger_right_click_ai") handleAIRequest(document.activeElement, request.aiType, request.selectionText);
});

// 🔥 核心逻辑：精准拦截并在次数用完时弹窗
function handleAIRequest(element, aiType, selectedText) {
    const textToProcess = selectedText || element.value || element.innerText;
    if (!textToProcess) { showToast(t('tEmpty')); return; }
    
    const toast = showToast(t('tAI'), 15000);
    chrome.runtime.sendMessage({ action: "call_openai", text: textToProcess, aiType: aiType }, (res) => {
        toast.remove();
        if (res && res.success) {
            const isTags = aiType === 'tags';
            let finalText = isTags ? "\n\n" + res.result : res.result;
            smartInsert(element, finalText, isTags ? false : !selectedText);
            showToast(t('tDone'));
        } else {
            const errorMsg = res ? res.message : t('tTimeout');
            if (errorMsg.includes("💎")) {
                showUpgradeModal(errorMsg);
            } else {
                showToast(errorMsg);
            }
        }
    });
}

function showUpgradeModal(msg) {
    const modal = document.createElement('div');
    modal.className = 'tg-geo-alert';
    modal.style.borderLeftColor = '#1890ff';
    modal.innerHTML = `
        <div class="tg-geo-title" style="color:#1890ff">${t('trialEnd')}</div>
        <div style="font-size:13px; color:#666; margin-bottom:12px; font-weight:bold;">${msg}</div>
        <button id="tg-buy-now" style="background:#1a1a1a; color:#fff; width:100%; border:none; padding:10px; border-radius:4px; cursor:pointer; font-weight:bold;">${t('buyBtn')}</button>
        <div id="tg-close-modal" style="text-align:center; margin-top:10px; font-size:12px; color:#999; cursor:pointer;">${t('later')}</div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('tg-buy-now').onclick = () => {
        window.open("YOUR_PAYMENT_LINK_HERE", "_blank");
        modal.remove();
    };
    document.getElementById('tg-close-modal').onclick = () => modal.remove();
}

function showWarningPanel(inputElement, msg) {
    const oldWarn = document.querySelector('.tg-price-warn');
    if (oldWarn) oldWarn.remove();
    
    const panel = document.createElement('div');
    panel.className = 'tg-ai-panel tg-risk-panel tg-price-warn';
    panel.innerHTML = `<div class="tg-row" style="color:#d48806;">⚠️ <b>${msg}</b></div><div class="tg-btn-row"><button class="tg-btn-base tg-btn-warn" style="width:100%; color:#fff; font-weight:bold;">${t('btnOk')}</button></div>`;
    
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.zIndex = '2147483647';
    
    const rect = inputElement.getBoundingClientRect();
    setTimeout(() => {
        let topPos = rect.top - panel.offsetHeight - 8;
        if (topPos < 0) topPos = rect.bottom + 8;
        let leftPos = rect.left;
        if (leftPos + panel.offsetWidth > window.innerWidth) leftPos = window.innerWidth - panel.offsetWidth - 10;
        
        panel.style.top = topPos + 'px';
        panel.style.left = Math.max(10, leftPos) + 'px';
    }, 10);
    
    panel.querySelector('button').onmousedown = (e) => { e.preventDefault(); panel.remove(); };
}

function showRiskPanel(inputElement, badWord, msg, isChat) {
    const oldPanel = document.querySelector('.tg-risk-panel:not(.tg-price-warn)');
    if (oldPanel) {
        if (oldPanel.dataset.word === badWord) return;
        oldPanel.remove();
    }
    
    const panel = document.createElement('div');
    panel.className = 'tg-ai-panel tg-risk-panel';
    panel.dataset.word = badWord;
    
    let displayMsg = msg;
    if (msg.includes(' / ')) {
        const parts = msg.split(' / ');
        displayMsg = currentLang === 'en' ? parts[1] : parts[0];
    }

    // 🔥 对免费用户彻底放开 AI 修复按钮展示 (不再是置灰的锁定按钮)
    let btns = `<button class="tg-btn-base tg-btn-fix">${t('btnDel')}</button>`;
    btns += `<button class="tg-btn-base tg-btn-polish">${t('btnAi')}</button>`;

    const closeBtnHtml = `<span class="tg-panel-close" style="position:absolute; top:4px; right:6px; cursor:pointer; font-size:16px; color:#999; line-height:1;">&times;</span>`;
    panel.style.borderLeftColor = isChat ? '#8e44ad' : '#ff4757';
    panel.innerHTML = `${closeBtnHtml}<div class="tg-row" style="color:${isChat ? '#8e44ad' : '#333'}; padding-right: 14px; margin-top:4px;">⚠️ ${displayMsg}: <b>"${badWord}"</b></div><div class="tg-btn-row">${btns}</div>`;
    
    document.body.appendChild(panel);
    panel.style.position = 'fixed';
    panel.style.zIndex = '2147483647';

    const rect = inputElement.getBoundingClientRect();
    setTimeout(() => {
        let topPos = rect.top - panel.offsetHeight - 8;
        if (topPos < 0) topPos = rect.bottom + 8;
        let leftPos = rect.left;
        if (leftPos + panel.offsetWidth > window.innerWidth) leftPos = window.innerWidth - panel.offsetWidth - 10;
        
        panel.style.top = topPos + 'px';
        panel.style.left = Math.max(10, leftPos) + 'px';
    }, 10);

    panel.querySelector('.tg-panel-close').onmousedown = (e) => { e.preventDefault(); panel.remove(); };
    panel.querySelector('.tg-btn-fix').onmousedown = (e) => { e.preventDefault(); forceDelete(inputElement, badWord); panel.remove(); };
    panel.querySelector('button:last-child').onmousedown = (e) => { e.preventDefault(); panel.remove(); handleAIRequest(inputElement, "polish", ""); };
}

function showGeoAlert(safe, curr) {
    const existing = document.querySelector('.tg-geo-alert');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.className = 'tg-geo-alert';
    const freeTips = !isPro ? `<div style="font-size:12px; color:#d46b08; margin-top:8px; font-weight:bold;">${t('freeIpTips')}</div>` : "";
    
    div.innerHTML = `<div class="tg-geo-title">${t('geoAlertTitle')}</div><div class="tg-ip-row">${t('geoSafe')} <span style="color:#2ed573;font-weight:bold;">${safe}</span></div><div class="tg-ip-row">${t('geoCurr')} <span style="color:#ff4757;font-weight:bold;font-size:14px;">${curr}</span></div>${freeTips}<button id="tg-close-geo" style="background:#8e44ad; color:#fff; font-weight:bold; margin-top:10px; width:100%; border:none; padding:8px; border-radius:4px; cursor:pointer;">${t('ipBtn')}</button>`;
    
    document.body.appendChild(div);
    chrome.storage.local.remove('tg_geo_alert');
    document.getElementById('tg-close-geo').onclick = () => { div.remove(); };
}

function showIPAlert(oldIP, newIP) {
    if (document.querySelector('.tg-geo-alert')) return;
    const existing = document.querySelector('.tg-ip-alert:not(.tg-geo-alert)');
    if (existing) existing.remove();
    
    const div = document.createElement('div');
    div.className = 'tg-ip-alert';
    const freeTips = !isPro ? `<div style="font-size:12px; color:#d46b08; margin-top:8px; font-weight:bold;">${t('freeIpTips')}</div>` : "";
    
    div.innerHTML = `<div class="tg-ip-title">${t('ipAlert')}</div><div class="tg-ip-row">${t('ipOld')} <span style="color:#666;">${oldIP}</span></div><div class="tg-ip-row">${t('ipNew')} <span style="color:#ff4757;font-weight:bold;font-size:14px;">${newIP}</span></div>${freeTips}<button id="tg-close-ip" style="background:#ff4757; color:#fff; font-weight:bold; border:none; border-radius:4px; padding:4px 10px; margin-top:8px; width:100%; cursor:pointer;">${t('ipBtn')}</button>`;
    
    document.body.appendChild(div);
    chrome.storage.local.remove('tg_ip_alert');
    document.getElementById('tg-close-ip').onclick = () => { div.remove(); };
}

function calculateAndShowWand(target, text, isInput) {
    let rect = null;
    const selection = window.getSelection();
    try {
        if (!isInput && selection.rangeCount > 0) {
            const r = selection.getRangeAt(0).getBoundingClientRect();
            if (r.width > 0 && r.height > 0) rect = r;
        }
    } catch (e) { }
    
    if (!rect) {
        const boxRect = target.getBoundingClientRect();
        rect = { left: boxRect.right - 50, top: boxRect.top - 5, width: 0 };
    }
    
    if (rect) {
        const scrollX = window.scrollX || document.documentElement.scrollLeft;
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        let x = rect.left + (rect.width / 2) + scrollX;
        let y = rect.top + scrollY - 45;
        
        if (rect.top < 50) y = rect.bottom + scrollY + 10;
        if (isInput && rect.width === 0) x = rect.left + scrollX;
        
        showMagicBtn(x, y, target, text);
    }
}

function showMagicBtn(x, y, target, text) {
    const oldBtn = document.getElementById('tg-magic-btn');
    if (oldBtn) oldBtn.remove();
    
    const btn = document.createElement('div');
    btn.id = 'tg-magic-btn';
    btn.className = 'tg-magic-btn';
    btn.innerHTML = '✨';
    btn.style.left = x + 'px';
    btn.style.top = y + 'px';
    
    btn.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        let finalText = text;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            finalText = target.value.substring(target.selectionStart, target.selectionEnd).trim() || text;
        }
        showAIOptions(x, y + 45, target, finalText);
        btn.remove();
    };
    document.body.appendChild(btn);
}

function showAIOptions(x, y, element, text) {
    const old = document.querySelector('.tg-ai-panel');
    if (old) old.remove();
    
    const panel = document.createElement('div');
    panel.className = 'tg-ai-panel';
    const screenWidth = window.innerWidth;
    panel.style.left = (x + 300 > screenWidth) ? (screenWidth - 310) + 'px' : Math.max(10, x - 150) + 'px';
    panel.style.top = y + 'px';
    
    // 🔥 全部替换为正常蓝色按钮，不再展示灰色上锁按钮
    let btns = `<button data-t="polish" class="tg-btn-base tg-btn-polish">${t('btnPolish')}</button><button data-t="title" class="tg-btn-base tg-btn-title">${t('btnTitle')}</button><button data-t="tags" class="tg-btn-base tg-btn-tags">${t('btnTags')}</button>`;
    
    panel.innerHTML = `<div class="tg-row">${t('aiMenu')}</div><div class="tg-btn-row">${btns}</div>`;
    document.body.appendChild(panel);

    panel.querySelectorAll('button[data-t]').forEach(b => {
        b.onmousedown = (e) => {
            e.preventDefault();
            handleAIRequest(element, b.dataset.t, text);
            panel.remove();
        };
    });
    
    setTimeout(() => {
        document.addEventListener('mousedown', function rm(e) {
            if (!panel.contains(e.target)) {
                panel.remove();
                document.removeEventListener('mousedown', rm);
            }
        });
    }, 100);
}

function forceDelete(element, badWord) {
    element.focus();
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const regex = new RegExp(badWord, "gi");
        const val = element.value.replace(regex, "").replace(/\s+/g, ' ').trim();
        const proto = element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(element, val);
        else element.value = val;
        element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        const regex = new RegExp(badWord, "gi");
        element.innerHTML = element.innerHTML.replace(regex, "");
        element.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

function checkRisk(target) {
    const text = (target.value || target.innerText || "").toLowerCase();
    target.classList.remove('tikguard-risk-border');
    const nameStr = (target.name || target.id || target.className || target.placeholder || "").toLowerCase();

    if (nameStr.includes('discount') || nameStr.includes('off') || nameStr.includes('sale') || nameStr.includes('percentage')) {
        const val = parseFloat(target.value);
        if (!isNaN(val) && val >= 50 && val <= 100) {
            target.classList.add('tikguard-risk-border');
            showWarningPanel(target, t('priceWarn'));
            return;
        } else {
            const warnPanel = document.querySelector('.tg-price-warn');
            if (warnPanel) warnPanel.remove();
        }
    }

    const urlStr = location.href.toLowerCase();
    const isChat = nameStr.includes('chat') || nameStr.includes('message') || urlStr.includes('chat') || urlStr.includes('connection');
    let hasViolation = false;

    // ✅ 这里已经完全恢复了正确的嵌套结构和 \b 正则
    if (Array.isArray(rules)) {
        for (const r of rules) {
            if (r.type === 'LIVE' || !r.keywords) continue;
            if (r.type === 'CHAT' && !isChat) continue;
            
            for (const w of r.keywords) {
                const regex = new RegExp("\\b" + w + "\\b", "i");
                if (regex.test(text)) {
                    target.classList.add('tikguard-risk-border');
                    showRiskPanel(target, w, r.message, r.type === 'CHAT');
                    hasViolation = true;
                    return;
                }
            }
        }
    }
    
    if (!hasViolation) {
        const p = document.querySelector('.tg-risk-panel:not(.tg-price-warn)');
        if (p) p.remove();
    }
}

function startMonitoring() {
    let timer;
    document.addEventListener('input', (e) => {
        const t = e.target;
        if (!t) return;
        if (['INPUT', 'TEXTAREA'].includes(t.tagName) || t.isContentEditable) {
            clearTimeout(timer);
            timer = setTimeout(() => checkRisk(t), 300);
        }
    }, true);
}

function showToast(msg, time = 3000) {
    const d = document.createElement('div');
    d.className = 'tg-toast';
    d.innerText = msg;
    document.body.appendChild(d);
    setTimeout(() => d.remove(), time);
    return d;
}