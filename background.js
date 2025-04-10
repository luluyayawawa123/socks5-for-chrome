// 在文件开头添加初始化函数
async function initializeProxyState() {
  try {
    // 获取存储的代理状态
    const result = await chrome.storage.local.get(['proxyEnabled']);
    
    // 更新图标状态
    updateBadge(result.proxyEnabled || false);
    
    // 如果之前是启用状态，确保代理设置正确应用
    if (result.proxyEnabled) {
      const config = await chrome.storage.local.get(['proxyHost', 'proxyPort']);
      updateProxy(true, config.proxyHost, config.proxyPort);
    }
  } catch (error) {
    console.error('初始化代理状态失败:', error);
    // 发生错误时，重置为禁用状态
    updateBadge(false);
    updateProxy(false);
  }
}

// 添加启动时的监听器
chrome.runtime.onStartup.addListener(() => {
  initializeProxyState();
});

// 移除错误的事件监听器
// chrome.runtime.onActivated && chrome.runtime.onActivated.addListener(() => {
//   console.log('扩展被激活');
//   initializeProxyState();
// });

// 在服务工作线程启动时主动初始化
// 这将确保在扩展被启用时运行
initializeProxyState();

// 安装/更新时的监听器保持不变，但也调用初始化函数
chrome.runtime.onInstalled.addListener(() => {
  // 初始化默认设置
  chrome.storage.local.set({
    proxyEnabled: false,
    proxyHost: '127.0.0.1',
    proxyPort: 65500
  });
  
  initializeProxyState();
});

// 处理代理设置
function updateProxy(enabled, host, port) {
  if (enabled) {
    chrome.proxy.settings.set({
      value: {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: "socks5",
            host: host,
            port: parseInt(port)
          }
        }
      },
      scope: "regular"
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('代理设置失败:', chrome.runtime.lastError);
      }
    });
  } else {
    chrome.proxy.settings.set({
      value: { mode: "direct" },
      scope: "regular"
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('代理设置失败:', chrome.runtime.lastError);
      }
    });
  }
}

function updateBadge(isProxyEnabled) {
  if (isProxyEnabled) {
    chrome.action.setBadgeText({ text: '开' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    chrome.action.setBadgeText({ text: '关' });
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
  }
}

async function testProxyConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 增加到10秒
    
    const startTime = Date.now();
    const response = await fetch('https://www.google.com/favicon.ico', {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    const endTime = Date.now();
    const timeUsed = endTime - startTime;

    return {
      success: response.ok,
      timeUsed: timeUsed,
      status: response.status,
      statusText: response.statusText
    };
  } catch (error) {
    console.error('代理测试失败:', error);
    return {
      success: false,
      error: error.name === 'AbortError' ? '连接超时' : error.message
    };
  }
}

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'updateProxy') {
    updateProxy(request.enabled, request.host, request.port);
    updateBadge(request.enabled);
    sendResponse({ 
      success: true,
      status: request.enabled ? 'enabled' : 'disabled',
      config: {
        host: request.host,
        port: request.port
      }
    });
    return true; // 表示异步发送响应
  }
  else if (request.action === 'testProxy') {
    testProxyConnection().then(result => {
      sendResponse(result);
    });
    return true;
  }
  else if (request.action === 'checkStatus') {
    // 添加这个处理器来检查和同步代理状态
    initializeProxyState().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('状态检查失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
}); 