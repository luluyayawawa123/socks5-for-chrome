document.addEventListener('DOMContentLoaded', () => {
  // 添加状态检查请求，确保badge图标与存储的状态一致
  function checkStatus() {
    chrome.runtime.sendMessage({ action: 'checkStatus' }, (response) => {
      // 如果没有收到响应或出错（可能是因为background脚本还未完全初始化）
      if (chrome.runtime.lastError || !response || !response.success) {
        console.log('状态检查等待中，将在500ms后重试...');
        // 稍后重试
        setTimeout(checkStatus, 500);
      } else {
        console.log('状态检查成功，代理状态已同步');
      }
    });
  }
  
  // 立即执行状态检查
  checkStatus();

  const testButton = document.getElementById('testProxy');
  const testResult = document.getElementById('testResult');

  // 加载保存的设置
  chrome.storage.local.get(['proxyEnabled', 'proxyHost', 'proxyPort'], (result) => {
    const proxySwitch = document.getElementById('proxySwitch');
    proxySwitch.checked = result.proxyEnabled;
    document.getElementById('proxyHost').value = result.proxyHost || '127.0.0.1';
    document.getElementById('proxyPort').value = result.proxyPort || 65500;
    
    // 更新状态文本
    document.getElementById('statusText').textContent = 
      result.proxyEnabled ? '代理已启用' : '代理已关闭';

    // 根据代理状态显示/隐藏测试按钮，并重置测试结果区域
    if (result.proxyEnabled) {
      testButton.style.display = 'block';
      testResult.style.display = 'block';
      // 初始化时重置测试结果，确保没有遗留的样式
      if (!testResult.textContent) {
        testResult.className = 'test-result';
      }
    } else {
      testButton.style.display = 'none';
      testResult.style.display = 'none';
      testResult.textContent = '';
      testResult.className = 'test-result';
    }
  });

  // 代理开关事件
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
    
    // 完全重置测试结果区域（文本和样式）
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

  // 保存按钮点击事件
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

  // 测试按钮点击事件
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
}); 