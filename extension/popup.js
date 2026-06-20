const BUY_LINK = "YOUR_SPONSOR_LINK_HERE";
const RATE_API = "https://open.er-api.com/v6/latest/USD";

const I18N = {
    zh: {
        statusFree: "🛡️ 基础护航版", statusPro: "⚡ Pro 终极防封版",
        calcTitle: "💱 实时汇率计算", calcAmount: "金额 (Amount)", calcFrom: "持有货币", calcResult: "换算结果", calcTo: "兑换为",
        netTitle: "🌍 节点纯净度监控与体检", netCurrent: "当前 IP", ipFetching: "深度扫描中...", ipError: "查询失败",
        envWarn: "⚠️ 高危：本地时区与节点不符，易触发风控！",
        dirtyIpWarn: "🚨 危险：检测到当前网络为机房代理！极易连坐封店，建议使用独享住宅 IP！",
        geoFence: "🛡️ 专属安全国家", geoNone: "未开启 (Off)",
        washTitle: "🖼️ 图片 100% 洗白引擎 (批量防查重)", washDrop: "点击或拖拽图片至此<br>(支持按住Ctrl多选批量处理)",
        washing: "⏳ 正在批量强力洗白...", washDone: "✅ 全部洗白完成，已下载！", washErr: "请上传正确图片格式",
        actDesc: "激活 Pro 解锁 <b>图片洗白 + Geo防关联盾 + 客服风控</b>", 
        actPlace: "输入您的 爱发电用户 ID (或老用户激活码)", 
        actBtn: "激活 / 已续费点此刷新", 
        actBuy: "🛒 获取 Pro 护航特权 (订阅赞助)",
        syncBtn: "🔄 刷新风控云规则库", tipsPrefix: "💡 安全贴士:",
        tipTexts: ["客服私信发送诱导好评或 PayPal 将被严重警告。", "打折力度超过 50% 将触发破产预警。", "公用梯子极易连坐封店，请使用干净的静态住宅IP。"],
        verifying: "验证中...", actSuccess: "🎉 激活成功！", actFail: "未查询到有效赞助或已过期", actError: "⚠️ 通信异常，请重试",
        syncing: "⏳ 下载中...", syncSuccess: "✅ 同步成功！共加载 {c} 条规则。", syncFail: "⚠️ 网络受阻 (已启用保底规则)。"
    },
    en: {
        statusFree: "🛡️ Free Version", statusPro: "⚡ Pro Active",
        calcTitle: "💱 Live Exchange Rate", calcAmount: "Amount", calcFrom: "From", calcResult: "Result", calcTo: "To",
        netTitle: "🌍 IP Purity Scanner", netCurrent: "Current IP", ipFetching: "Scanning...", ipError: "Error",
        envWarn: "⚠️ DANGER: Local timezone mismatch with current IP!",
        dirtyIpWarn: "🚨 RISK: Public Datacenter/VPN IP detected! High risk of association ban.",
        geoFence: "🛡️ Geo-Fence Country", geoNone: "Disabled",
        washTitle: "🖼️ 100% Image Scrubber (Batch)", washDrop: "Click or Drop images here<br>(Ctrl+Click for multiple)",
        washing: "⏳ Scrubbing images...", washDone: "✅ Done! Images downloaded.", washErr: "Invalid format",
        actDesc: "Activate Pro to unlock <b>Image Washer, Geo-Fence & Chat Guard</b>", 
        actPlace: "Enter Afdian User ID (or License Key)", 
        actBtn: "Activate / Refresh Status", 
        actBuy: "🛒 Get Pro Subscription",
        syncBtn: "🔄 Sync Cloud Rules", tipsPrefix: "💡 Tip:",
        tipTexts: ["Chat guard will warn you against off-platform links.", "Fat finger lock warns if discount > 50%.", "Use Residential IPs instead of public VPNs."],
        verifying: "Verifying...", actSuccess: "🎉 Activated Successfully!", actFail: "Invalid ID or Expired", actError: "⚠️ Connection Error",
        syncing: "⏳ Downloading...", syncSuccess: "✅ Synced successfully! Loaded {c} rules.", syncFail: "⚠️ Download Timeout."
    }
};

let currLang = 'zh';

document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(['tikguard_activation', 'tg_lang_pref', 'tg_safe_country'], (res) => { 
        let pref = res.tg_lang_pref || 'auto'; document.getElementById('lang-select').value = pref;
        currLang = pref === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : pref;
        if (res.tg_safe_country) document.getElementById('geo-safe-country').value = res.tg_safe_country;
        applyLang();
        
        if (res.tikguard_activation) showProMode(); else showFreeMode(); 
    });

    document.getElementById('lang-select').addEventListener('change', (e) => {
        let val = e.target.value; chrome.storage.local.set({'tg_lang_pref': val});
        currLang = val === 'auto' ? (navigator.language.startsWith('zh') ? 'zh' : 'en') : val; applyLang();
    });

    document.getElementById('geo-safe-country').addEventListener('change', (e) => {
        chrome.storage.local.set({'tg_safe_country': e.target.value}, () => {
            chrome.runtime.sendMessage({action: "force_check_ip"});
        });
    });

    initCalculator(); initImageWasher();
    document.getElementById('btn-buy').addEventListener('click', () => window.open(BUY_LINK, '_blank'));
    
    document.getElementById('btn-verify').addEventListener('click', () => {
        const key = document.getElementById('license-key').value.trim(); const btn = document.getElementById('btn-verify'); const msg = document.getElementById('msg');
        if (!key) return; btn.innerText = I18N[currLang].verifying; btn.disabled = true; msg.innerText = "";
        chrome.runtime.sendMessage({action: "verify_license", key: key}, (res) => {
            if (chrome.runtime.lastError || !res) { msg.innerText = I18N[currLang].actError; btn.innerText = I18N[currLang].actBtn; btn.disabled = false; return; }
            if (res.success) { showProMode(); alert(I18N[currLang].actSuccess); checkIP(); } 
            else { msg.innerText = res?.message || I18N[currLang].actFail; btn.innerText = I18N[currLang].actBtn; btn.disabled = false; }
        });
    });

    const syncBtn = document.getElementById('btn-sync');
    syncBtn.addEventListener('click', () => {
        syncBtn.innerText = I18N[currLang].syncing; syncBtn.disabled = true;
        const resetTimer = setTimeout(() => { if(syncBtn.disabled) { syncBtn.disabled = false; syncBtn.innerText = I18N[currLang].syncBtn; alert(I18N[currLang].syncFail); } }, 8000);
        chrome.runtime.sendMessage({action: "force_sync"}, (res) => {
            clearTimeout(resetTimer); 
            if (chrome.runtime.lastError || !res) { syncBtn.disabled = false; syncBtn.innerText = I18N[currLang].syncBtn; alert(I18N[currLang].actError); return; }
            syncBtn.disabled = false; syncBtn.innerText = I18N[currLang].syncBtn;
            if (res.success) alert(I18N[currLang].syncSuccess.replace('{c}', res.count)); else alert(I18N[currLang].syncFail);
        });
    });

    function applyLang() {
        const d = I18N[currLang];
        document.querySelectorAll('[data-i18n]').forEach(el => { const key = el.getAttribute('data-i18n'); if(d[key]) { if(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = d[key]; else el.innerHTML = d[key]; } });
        document.getElementById('activate-desc').innerHTML = d.actDesc; document.getElementById('license-key').placeholder = d.actPlace; 
        checkIP(); 
    }

    async function initCalculator() { 
        const amountEl = document.getElementById('calc-amount'); const fromEl = document.getElementById('calc-from'); const toEl = document.getElementById('calc-to'); const resultEl = document.getElementById('calc-result'); let rates = {}; 
        try { 
            const res = await fetch(RATE_API); const data = await res.json(); rates = data.rates; calculate(); 
        } catch(e) { resultEl.innerText = "Error"; } 
        function calculate() { 
            if (!rates['USD']) return; const amount = parseFloat(amountEl.value) || 0; const rateFrom = rates[fromEl.value]; const rateTo = rates[toEl.value]; 
            if (rateFrom && rateTo) { const finalVal = (amount / rateFrom) * rateTo; resultEl.innerText = finalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); } 
        } 
        amountEl.addEventListener('input', calculate); fromEl.addEventListener('change', calculate); toEl.addEventListener('change', calculate); 
    }
    
    async function fetchIPData() {
        try { const r = await fetch('https://ipwho.is/', {cache: 'no-store'}); const d = await r.json(); if(d.success) return { ip: d.ip, country_code: d.country_code, isProxy: (d.security && (d.security.proxy || d.security.vpn || d.security.hosting)), api_tz: d.timezone ? d.timezone.id : "" }; } catch(e) {}
        try { const r = await fetch('http://ip-api.com/json/', {cache: 'no-store'}); const d = await r.json(); if(d.status === 'success') return { ip: d.query, country_code: d.countryCode, isProxy: (d.proxy || d.hosting), api_tz: d.timezone || "" }; } catch(e) {}
        try { const r = await fetch('https://api.country.is/', {cache: 'no-store'}); const d = await r.json(); if(d.ip) return { ip: d.ip, country_code: d.country, isProxy: false, api_tz: "" }; } catch(e) {}
        try { const r = await fetch('https://api.myip.com/', {cache: 'no-store'}); const d = await r.json(); if(d.ip) return { ip: d.ip, country_code: d.cc, isProxy: false, api_tz: "" }; } catch(e) {}
        return null;
    }

    async function checkIP() { 
        const ipLoc = document.getElementById('ip-location'); ipLoc.style.color = "#333"; 
        const envWarn = document.getElementById('env-warn'); envWarn.style.display = "none";
        const dirtyWarn = document.getElementById('dirty-warn'); dirtyWarn.style.display = "none";
        
        ipLoc.innerText = I18N[currLang].ipFetching;
        
        const data = await fetchIPData();
        if(data) {
            const newIP = `${data.ip} (${data.country_code})`;
            ipLoc.innerText = newIP;
            
            if(data.isProxy) {
                dirtyWarn.style.display = "block";
                if(currLang === 'en') dirtyWarn.innerText = I18N.en.dirtyIpWarn;
            }
            
            const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
            if (data.api_tz && localTz !== data.api_tz) {
                envWarn.style.display = "block";
                const baseMsg = currLang === 'en' ? I18N.en.envWarn : I18N.zh.envWarn;
                envWarn.innerHTML = `${baseMsg}<br><span style="font-weight:normal; font-size:10px;">(本机: ${localTz} 🆚 节点: ${data.api_tz})</span>`;
            }
            // 注意：这里已经删除了 chrome.storage.local.set，防止弹窗覆盖旧 IP 导致无法触发报警
        } else {
            chrome.storage.local.get('tg_env_ip', (res) => { if(res.tg_env_ip) ipLoc.innerText = res.tg_env_ip; else ipLoc.innerText = I18N[currLang].ipError; });
        }
        chrome.runtime.sendMessage({action: "force_check_ip"});
    }

    chrome.storage.onChanged.addListener((changes) => {
        if (changes.tg_env_ip) { const ipLoc = document.getElementById('ip-location'); if (ipLoc) { ipLoc.innerText = changes.tg_env_ip.newValue; } }
    });

    function initImageWasher() {
        const zone = document.getElementById('img-washer-zone'); const input = document.getElementById('washer-input'); const text = document.getElementById('washer-text');
        zone.onclick = () => input.click(); zone.ondragover = e => { e.preventDefault(); zone.classList.add('dragover'); }; zone.ondragleave = e => { zone.classList.remove('dragover'); };
        zone.ondrop = e => { e.preventDefault(); zone.classList.remove('dragover'); if(e.dataTransfer.files.length > 0) processImages(e.dataTransfer.files); };
        input.onchange = e => { if(e.target.files.length > 0) processImages(e.target.files); };
        
        async function processImages(files) {
            text.innerText = I18N[currLang].washing;
            for (let file of files) {
                if(!file.type.startsWith('image/')) continue;
                await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image(); img.onload = () => {
                            const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
                            
                            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height); 
                            const data = imgData.data;
                            for (let i = 0; i < data.length; i += 4) {
                                if (Math.random() < 0.05) { 
                                    data[i] = Math.min(255, data[i] + (Math.random() > 0.5 ? 1 : -1));
                                    data[i+1] = Math.min(255, data[i+1] + (Math.random() > 0.5 ? 1 : -1));
                                    data[i+2] = Math.min(255, data[i+2] + (Math.random() > 0.5 ? 1 : -1));
                                }
                            }
                            ctx.putImageData(imgData, 0, 0);

                            canvas.toBlob(blob => { const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'SafeClean_' + file.name.replace(/\.[^/.]+$/, "") + ".png"; a.click(); resolve(); }, 'image/png');
                        }; img.src = e.target.result;
                    }; reader.readAsDataURL(file);
                });
            }
            text.innerText = I18N[currLang].washDone; setTimeout(() => { text.innerHTML = I18N[currLang].washDrop; }, 3500);
        }
    }

    function showFreeMode() { 
        document.getElementById('status-free').classList.remove('tg-hidden'); document.getElementById('box-activate').classList.remove('tg-hidden'); 
        document.getElementById('status-pro').classList.add('tg-hidden'); document.querySelectorAll('.tg-pro-only').forEach(e=>e.classList.add('tg-hidden')); 
    }
    function showProMode() { 
        document.getElementById('status-free').classList.add('tg-hidden'); document.getElementById('box-activate').classList.add('tg-hidden'); 
        document.getElementById('status-pro').classList.remove('tg-hidden'); document.querySelectorAll('.tg-pro-only').forEach(e=>e.classList.remove('tg-hidden')); 
    }
});