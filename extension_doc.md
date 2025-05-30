# Socks5代理切换器Chrome扩展实现文档

## 1. 项目概述

Socks5代理切换器是一个轻量级的Chrome浏览器扩展，用于快速切换浏览器的Socks5代理设置。该扩展允许用户：
- 一键开启/关闭Socks5代理
- 自定义代理服务器地址和端口
- 测试代理连接状态
- 通过图标状态直观显示代理是否启用

扩展基于Chrome扩展API的Manifest V3规范开发，采用现代化的前端开发方法，提供直观的用户界面和稳定的功能实现。

## 2. 项目结构

```
├── manifest.json      # 扩展配置文件
├── background.js      # 后台服务脚本
└── popup/
    ├── popup.html     # 弹出界面HTML
    ├── popup.js       # 弹出界面交互逻辑
    └── popup.css      # 弹出界面样式
```

## 3. 核心组件

### 3.1 配置文件 (manifest.json)

```json
{
  "manifest_version": 3,
  "name": "Socks5 代理切换器",
  "version": "1.0",
  "description": "快速切换本地 Socks5 代理",
  "permissions": [
    "proxy",
    "storage",
    "host_permissions"
  ],
  "host_permissions": [
    "https://www.google.com/"
  ],
  "action": {
    "default_popup": "popup/popup.html"
  },
  "background": {
    "service_worker": "background.js"
  }
}
```

该配置指定了扩展的基本信息、所需权限和组件关系：
- **权限**：
  - `proxy`: 控制浏览器的代理设置
  - `storage`: 存储用户配置
  - `host_permissions`: 访问特定网站的权限
- **主要组件**：
  - 后台服务工作线程：background.js
  - 弹出界面：popup/popup.html

### 3.2 后台服务 (background.js)

后台服务是扩展的核心，负责控制代理设置和状态管理。它包含以下主要功能：

#### 3.2.1 代理状态初始化
```javascript
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
```

该函数在扩展启动时恢复之前的代理状态，确保代理设置的持久性。

#### 3.2.2 代理配置管理
```javascript
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
```

该函数负责应用或移除Socks5代理设置，通过Chrome的`proxy.settings`API进行控制。

#### 3.2.3 状态图标管理
```javascript
function updateBadge(isProxyEnabled) {
  if (isProxyEnabled) {
    chrome.action.setBadgeText({ text: '开' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  } else {
    chrome.action.setBadgeText({ text: '关' });
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
  }
}
```

该函数更新扩展图标的徽章，直观显示代理状态（"开"或"关"）。

#### 3.2.4 代理连接测试
```javascript
async function testProxyConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
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
```

该函数通过尝试访问Google.com的favicon来测试代理连接的可用性，并返回测试结果和响应时间。

#### 3.2.5 消息处理
```javascript
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
    return true;
  }
  else if (request.action === 'testProxy') {
    testProxyConnection().then(result => {
      sendResponse(result);
    });
    return true;
  }
  else if (request.action === 'checkStatus') {
    initializeProxyState().then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('状态检查失败:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});
```

该部分负责处理来自弹出界面的消息请求，包括更新代理、测试连接和检查状态。

### 3.3 弹出界面

#### 3.3.1 界面结构 (popup.html)
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="container">
    <div class="switch-container">
      <label class="switch">
        <input type="checkbox" id="proxySwitch">
        <span class="slider round"></span>
      </label>
      <span id="statusText">代理已关闭</span>
    </div>
    <button id="testProxy" class="test-button">测试代理连接</button>
    <div id="testResult" class="test-result"></div>
    
    <div class="proxy-settings">
      <input type="text" id="proxyHost" placeholder="主机地址" value="127.0.0.1">
      <input type="number" id="proxyPort" placeholder="端口" value="65500">
    </div>
    
    <button id="saveSettings">保存设置</button>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

界面由滑块开关、测试按钮、配置输入框和保存按钮组成，布局简洁易用。

#### 3.3.2 界面交互 (popup.js)

**初始化逻辑**:
```javascript
document.addEventListener('DOMContentLoaded', () => {
  // 状态检查确保图标与实际状态同步
  function checkStatus() {
    chrome.runtime.sendMessage({ action: 'checkStatus' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.log('状态检查等待中，将在500ms后重试...');
        setTimeout(checkStatus, 500);
      } else {
        console.log('状态检查成功，代理状态已同步');
      }
    });
  }
  
  checkStatus();

  // 加载保存的设置
  chrome.storage.local.get(['proxyEnabled', 'proxyHost', 'proxyPort'], (result) => {
    const proxySwitch = document.getElementById('proxySwitch');
    proxySwitch.checked = result.proxyEnabled;
    document.getElementById('proxyHost').value = result.proxyHost || '127.0.0.1';
    document.getElementById('proxyPort').value = result.proxyPort || 65500;
    
    // 更新状态文本
    document.getElementById('statusText').textContent = 
      result.proxyEnabled ? '代理已启用' : '代理已关闭';

    // 根据代理状态显示/隐藏测试按钮
    testButton.style.display = result.proxyEnabled ? 'block' : 'none';
    testResult.style.display = result.proxyEnabled ? 'block' : 'none';
  });
  
  // ... 其他事件处理程序
});
```

**开关事件处理**:
```javascript
document.getElementById('proxySwitch').addEventListener('change', (e) => {
  const enabled = e.target.checked;
  const host = document.getElementById('proxyHost').value;
  const port = document.getElementById('proxyPort').value;

  // 更新状态文本
  document.getElementById('statusText').textContent = 
    enabled ? '代理已启用' : '代理已关闭';

  // 显示/隐藏测试按钮
  testButton.style.display = enabled ? 'block' : 'none';
  testResult.style.display = enabled ? 'block' : 'none';
  if (!enabled) {
    testResult.textContent = '';
    testResult.className = 'test-result'; // 重置为基本样式类，移除success或error样式
  }

  // 保存设置到存储
  chrome.storage.local.set({
    proxyEnabled: enabled,
    proxyHost: host,
    proxyPort: port
  });

  // 发送消息给background script更新代理
  chrome.runtime.sendMessage({
    type: 'updateProxy',
    enabled: enabled,
    host: host,
    port: port
  });
});
```

**保存设置事件处理**:
```javascript
document.getElementById('saveSettings').addEventListener('click', () => {
  const enabled = document.getElementById('proxySwitch').checked;
  const host = document.getElementById('proxyHost').value;
  const port = document.getElementById('proxyPort').value;

  // 保存设置到存储
  chrome.storage.local.set({
    proxyEnabled: enabled,
    proxyHost: host,
    proxyPort: port
  });

  // 发送消息给background script更新代理
  chrome.runtime.sendMessage({
    type: 'updateProxy',
    enabled: enabled,
    host: host,
    port: port
  }, (response) => {
    // 显示保存成功提示
    const saveButton = document.getElementById('saveSettings');
    const originalText = saveButton.textContent;
    
    // 创建或获取提示信息元素
    let saveMessage = document.getElementById('saveMessage');
    if (!saveMessage) {
      saveMessage = document.createElement('div');
      saveMessage.id = 'saveMessage';
      saveMessage.style.marginTop = '10px';
      saveMessage.style.padding = '8px';
      saveMessage.style.borderRadius = '4px';
      saveMessage.style.textAlign = 'center';
      saveMessage.style.fontWeight = 'bold';
      saveMessage.style.transition = 'opacity 0.5s';
      document.querySelector('.container').appendChild(saveMessage);
    }
    
    // 设置提示信息内容和样式
    saveMessage.style.backgroundColor = '#E8F5E9';
    saveMessage.style.color = '#4CAF50';
    saveMessage.style.border = '1px solid #A5D6A7';
    saveMessage.style.opacity = '1';
    
    // 显示设置详情
    saveMessage.innerHTML = `
      <div>设置已保存并生效！</div>
      <div style="font-size:0.9em; margin-top:5px;">
        代理状态: ${enabled ? '已启用' : '已关闭'}<br>
        ${enabled ? `主机: ${host}<br>端口: ${port}` : ''}
      </div>
    `;
    
    // 按钮临时变为确认状态
    saveButton.textContent = '✓ 已保存';
    saveButton.style.backgroundColor = '#4CAF50';
    
    // 3秒后恢复按钮状态，5秒后隐藏提示信息
    setTimeout(() => {
      saveButton.textContent = originalText;
      saveButton.style.backgroundColor = '';
      
      // 渐变隐藏提示信息
      setTimeout(() => {
        saveMessage.style.opacity = '0';
      }, 2000);
    }, 3000);
  });
});
```

**测试按钮事件处理**:
```javascript
testButton.addEventListener('click', async () => {
  testResult.textContent = '正在测试...';
  testResult.className = 'test-result';
  
  try {
    const result = await chrome.runtime.sendMessage({ action: 'testProxy' });
    if (result.success) {
      testResult.textContent = `连接成功\n响应时间: ${result.timeUsed}ms`;
      testResult.className = 'test-result success';
    } else {
      testResult.textContent = `连接失败\n原因: ${result.error || '未知错误'}`;
      testResult.className = 'test-result error';
    }
  } catch (error) {
    testResult.textContent = '测试出错\n原因: 扩展内部错误';
    testResult.className = 'test-result error';
  }
});
```

#### 3.3.3 界面样式 (popup.css)

界面样式主要包括：
- 滑块开关样式
- 输入框和按钮样式
- 测试结果区域的成功/失败状态样式
- 动画和交互效果

## 4. 功能实现流程

### 4.1 扩展初始化流程

1. 用户安装/更新扩展或浏览器启动
2. `chrome.runtime.onInstalled`或`chrome.runtime.onStartup`事件触发
3. `initializeProxyState()`函数执行：
   - 从存储中读取之前的代理状态
   - 更新图标徽章显示
   - 如果之前是启用状态，应用代理设置

### 4.2 代理开启/关闭流程

1. 用户点击扩展图标打开弹出界面
2. 界面初始化时从存储读取并显示当前代理状态
3. 用户切换代理开关
4. 更新界面状态（文本和测试按钮显示）
5. 保存新状态到存储
6. 发送消息给后台脚本更新代理设置和图标状态

### 4.3 保存配置流程

1. 用户修改代理服务器地址或端口
2. 点击"保存设置"按钮
3. 保存配置到存储
4. 发送消息给后台脚本更新代理设置
5. 显示保存成功提示和配置详情

### 4.4 测试连接流程

1. 用户点击"测试代理连接"按钮
2. 显示"正在测试..."状态
3. 发送测试请求给后台脚本
4. 后台脚本尝试通过代理访问Google.com的favicon
5. 返回测试结果（成功/失败）和相关信息（响应时间或错误原因）
6. 更新测试结果显示

### 4.5 状态同步机制

为解决扩展禁用后再启用时图标状态不同步问题，实现了状态检查机制：

1. 后台脚本初始化时主动调用`initializeProxyState()`同步状态
2. 弹出界面加载时发送`checkStatus`消息请求状态检查
3. 如果检查失败（可能是后台脚本尚未完全初始化），采用重试机制

## 5. 容错与异常处理

1. **代理设置失败处理**：捕获并记录`chrome.runtime.lastError`错误
2. **代理测试超时处理**：使用`AbortController`和超时设置（10秒）
3. **状态检查失败处理**：采用重试机制，500ms后再次尝试
4. **界面加载异常处理**：提供默认值（主机127.0.0.1，端口65500）
5. **测试结果区域显示bug修复**：确保在关闭代理时完全重置测试结果区域的样式和内容

## 6. 优化与性能

1. **存储优化**：仅存储必要的配置信息（enabled, host, port）
2. **UI响应优化**：状态切换时立即更新界面，提供即时反馈
3. **错误信息友好化**：将技术错误转换为用户友好的提示
4. **异步操作处理**：使用Promise和async/await处理异步操作
5. **用户体验优化**：为保存设置操作添加明确的成功反馈

## 7. 安全性考虑

1. **权限最小化**：仅申请必要的权限（proxy, storage, host_permissions）
2. **外部请求限制**：仅允许访问Google.com用于测试连接
3. **数据隔离**：代理配置仅存储在用户的本地存储中

## 8. 扩展集成与兼容性

1. **Chrome API兼容性**：使用Manifest V3规范开发，兼容最新的Chrome浏览器
2. **UI适配**：界面设计适应不同系统的显示效果
3. **错误处理**：优雅处理API调用失败情况

## 9. 源码维护与扩展

代码结构清晰，各功能模块职责明确，便于维护和扩展。可以考虑的扩展方向：

1. 支持多个代理配置文件并快速切换
2. 添加PAC脚本支持
3. 增加代理自动切换规则
4. 支持HTTP代理和其他代理类型
5. 添加代理服务器状态监控功能

## 10. 总结

Socks5代理切换器Chrome扩展采用模块化设计，提供了简洁直观的用户界面和可靠的代理控制功能。通过后台服务和弹出界面的协作，实现了代理配置的持久化、状态同步和连接测试等核心功能。扩展的容错机制和状态同步设计确保了在各种情况下（包括扩展禁用再启用）都能正确维持用户配置和状态显示的一致性。默认配置使用本地地址127.0.0.1和端口65500，方便用户快速配置常见的代理服务。
