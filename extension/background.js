const API_ENDPOINT = "https://your-worker-domain.workers.dev";

const REMOTE_RULES_URLS = [
    "https://your-remote-rules-url.json",
    "https://your-remote-rules-url.json;

let bgLang = 'zh';
let lastIPCheckTime = 0;

const MENU_I18N = {
    zh: { root: "⚡ TikGuard AI 助手", polish: "✨ 智能润色", title: "🏆 优化 SEO 标题", tags: "🏷️ 生成流量标签" },
    en: { root: "⚡ TikGuard AI", polish: "✨ Polish Text", title: "🏆 SEO Title", tags: "🏷️ Generate Tags" }
};

function getBuiltInRules() {
    return [
        { "type": "INPUT", "keywords": ["whatsapp", "telegram", "line", "wechat", "phone number", "contact me", "email", "gmail", "yahoo", "pay outside", "bank transfer"], "message": "🚫 导流/交易违规：禁止引导站外交流与付款 / 🚫 Traffic Risk: Off-platform contact" },
        { "type": "INPUT", "keywords": ["nike", "adidas", "gucci", "chanel", "lv", "louis vuitton", "dior", "hermes", "prada", "rolex", "apple", "iphone", "disney", "lego"], "message": "©️ 侵权高危：检测到奢侈品或知名IP / ©️ IP Risk: High-risk brand detected" },
        { "type": "CHAT", "keywords": ["5 star review", "cash back", "refund for review", "whatsapp", "paypal", "pay for 5 stars"], "message": "🛑 客服防爆红线：严禁发送诱导好评或站外交易词 / 🛑 Chat Risk: Review manipulation or diversion detected" },
        { "type": "LIVE", "keywords": ["violation", "suspended", "restricted", "counterfeit", "intellectual property", "traffic diversion"], "message": "🚨 平台风控警告 / 🚨 System Risk: Penalty word" }
    ];
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get('tg_lang_pref', (res) => {
        bgLang = (res.tg_lang_pref || 'auto') === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : res.tg_lang_pref;
        setupMenus();
    });
    chrome.storage.local.set({ 'tikguard_rules': getBuiltInRules() });
    updateRulesFromCloud();
    chrome.alarms.create("check_ip", { periodInMinutes: 1 });
    chrome.alarms.create("fetch_rules", { periodInMinutes: 60 });
    chrome.alarms.create("verify_subscription", { periodInMinutes: 1440 });
});

chrome.runtime.onStartup.addListener(() => silentSubscriptionCheck());

chrome.storage.onChanged.addListener((c) => {
    if (c.tg_lang_pref) {
        bgLang = (c.tg_lang_pref.newValue || 'auto') === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : c.tg_lang_pref.newValue;
        setupMenus();
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "fetch_rules") updateRulesFromCloud();
    if (alarm.name === "check_ip") checkIPChange();
    if (alarm.name === "verify_subscription") silentSubscriptionCheck();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "verify_license") {
        verifyLicense(request.key, true).then(sendResponse);
        return true;
    }
    if (request.action === "force_check_ip") {
        checkIPChange(true);
        if (sendResponse) sendResponse({ status: "checking" });
        return true;
    }
    if (request.action === "force_sync") {
        updateRulesFromCloud().then(sendResponse);
        return true;
    }

    // 🔥 增加 5 次 AI 免费试用与拦截控制
    if (request.action === "call_openai") {
        chrome.storage.local.get(['tikguard_activation', 'tg_free_ai_usage'], async (res) => {
            const isPro = !!res.tikguard_activation;
            // 强制计算当前的北京时间（UTC+8），彻底无视指纹浏览器的时区伪装
            const now = new Date();
            const bjTimeMs = now.getTime() + (8 * 60 * 60 * 1000); 
            const today = new Date(bjTimeMs).toISOString().split('T')[0];
            let usage = res.tg_free_ai_usage || { date: today, count: 0 };
            
            if (usage.date !== today) {
                usage = { date: today, count: 0 };
            }

            if (!isPro && usage.count >= 5) {
                sendResponse({ success: false, message: bgLang === 'zh' ? "💎 每日 5 次 AI 试用额度已用完" : "💎 Daily trial limit reached" });
                return;
            }

            let sys = "You are a professional e-commerce assistant.";
            if (request.aiType === 'tags') {
                sys = "Generate 5-8 viral hashtags for this product. Only return the hashtags.";
            } else if (request.aiType === 'title') {
                sys = "Rewrite title for SEO to increase conversion. Keep it clean.";
            } else {
                // ✅ 注入了专属的 TikTok 合规防封 Prompt，不再瞎猜
                sys = "You are an expert TikTok Shop compliance assistant. The user's text contains strictly banned off-platform diversion words (e.g., 'wechat', 'line', 'whatsapp') or highly risky brand names. Your exact task is to rewrite the text to be polite, natural, and 100% compliant with platform rules. NEVER use words that imply off-platform communication or payment. Instead of apps, use 'our platform chat'. Instead of external payments, use 'secure checkout'. Retain the original intent but eliminate the risk.";
            }

            const apiRes = await callCloudflare(request.text, sys);

            if (!isPro && apiRes.success) {
                usage.count += 1;
                chrome.storage.local.set({ 'tg_free_ai_usage': usage });
            }
            sendResponse(apiRes);
        });
        return true;
    }
});

async function fetchSafeIP() {
    try {
        const r = await fetch('https://ipwho.is/', { cache: 'no-store' });
        const d = await r.json();
        if (d.success) return { ip: d.ip, country: d.country_code };
    } catch (e) { }
    try {
        const r = await fetch('http://ip-api.com/json/', { cache: 'no-store' });
        const d = await r.json();
        if (d.status === 'success') return { ip: d.query, country: d.countryCode };
    } catch (e) { }
    return null;
}

// 🔥 IP 监控：免费用户仅限一次惊吓
async function checkIPChange(isForce = false) {
    const now = Date.now();
    if (!isForce && now - lastIPCheckTime < 5000) return;
    lastIPCheckTime = now;

    const data = await fetchSafeIP();
    if (!data) return;
    const newIP = `${data.ip} (${data.country})`;

    chrome.storage.local.get(['tg_env_ip', 'tikguard_activation', 'tg_safe_country', 'tg_free_ip_warned'], (storage) => {
        const oldIP = storage.tg_env_ip;
        const isPro = !!storage.tikguard_activation;
        const hasWarnedFree = !!storage.tg_free_ip_warned;

        if (storage.tg_safe_country && storage.tg_safe_country !== 'NONE' && data.country !== storage.tg_safe_country) {
            if (isPro || !hasWarnedFree) {
                chrome.storage.local.set({ 'tg_geo_alert': { current: data.country, safe: storage.tg_safe_country, time: Date.now() } });
                if (!isPro) chrome.storage.local.set({ 'tg_free_ip_warned': true });
            }
        } else if (oldIP && oldIP !== newIP) {
            if (isPro || !hasWarnedFree) {
                chrome.storage.local.set({ 'tg_ip_alert': { old: oldIP, new: newIP, time: Date.now() } });
                if (!isPro) chrome.storage.local.set({ 'tg_free_ip_warned': true });
            }
        }
        
        if (oldIP !== newIP || !oldIP) {
            chrome.storage.local.set({ 'tg_env_ip': newIP });
        }
    });
}

async function updateRulesFromCloud() {
    const builtIn = getBuiltInRules();
    for (const url of REMOTE_RULES_URLS) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            const response = await fetch(`${url}?t=${Date.now()}`, { signal: controller.signal, cache: "no-store" });
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const rules = JSON.parse(await response.text());
                if (Array.isArray(rules) && rules.length > 0) {
                    const combined = [...builtIn, ...rules];
                    await chrome.storage.local.set({ 'tikguard_rules': combined });
                    return { success: true, count: combined.length };
                }
            }
        } catch (error) { }
    }
    await chrome.storage.local.set({ 'tikguard_rules': builtIn });
    return { success: false, count: builtIn.length };
}

async function callCloudflare(text, sys) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(API_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [{ role: "system", content: sys }, { role: "user", content: text }] }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!res.ok) return { success: false, message: `API Error HTTP ${res.status}` };
        const d = await res.json();
        
        if (d && d.result) {
            return { success: true, result: (typeof d.result === 'string' ? d.result : JSON.stringify(d.result)).replace(/^"|"$/g, '') };
        } else if (d && d.response) {
            return { success: true, result: (typeof d.response === 'string' ? d.response : JSON.stringify(d.response)).replace(/^"|"$/g, '') };
        }
        return { success: false, message: "API Format Error" };
    } catch (e) {
        return { success: false, message: "Network Timeout" };
    }
}

function setupMenus() {
    chrome.contextMenus.removeAll(() => {
        const t = MENU_I18N[bgLang];
        chrome.contextMenus.create({ id: "tg_root", title: t.root, contexts: ["selection", "editable"] });
        chrome.contextMenus.create({ parentId: "tg_root", id: "tg_polish", title: t.polish, contexts: ["selection", "editable"] });
        chrome.contextMenus.create({ parentId: "tg_root", id: "tg_title", title: t.title, contexts: ["selection", "editable"] });
        chrome.contextMenus.create({ parentId: "tg_root", id: "tg_tags", title: t.tags, contexts: ["selection", "editable"] });
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    let type = "polish";
    if (info.menuItemId === "tg_title") type = "title";
    if (info.menuItemId === "tg_tags") type = "tags";
    
    if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: "trigger_right_click_ai", aiType: type, selectionText: info.selectionText || "" });
    }
});

async function verifyLicense(key, isManualActivate = false) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const verifyUrl = API_ENDPOINT + "/verify";
        
        const r = await fetch(verifyUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify", code: key.trim() }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        const d = await r.json();
        if (d.valid === true || d.success === true) {
            chrome.storage.local.set({ 'tikguard_activation': true, 'tg_saved_key': key.trim() });
            return { success: true };
        }
        chrome.storage.local.set({ 'tikguard_activation': false, 'tg_saved_key': '' });
        // ✅ 这里的失败提示语已优化，兼容查爱发电 ID 或查原始激活码的场景
        return { success: false, message: bgLang === 'zh' ? (d.message || "❌ 未查询到有效赞助或已过期") : (d.message || "❌ Invalid ID or Expired") };
    } catch (e) {
        return { success: false, message: bgLang === 'zh' ? "📡 请求超时，请检查网络" : "📡 Network Timeout" };
    }
}

function silentSubscriptionCheck() {
    chrome.storage.local.get('tg_saved_key', (res) => {
        if (res.tg_saved_key) verifyLicense(res.tg_saved_key, false);
    });
}