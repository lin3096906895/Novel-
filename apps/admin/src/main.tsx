import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#25685e',
          colorInfo: '#25685e',
          colorBgLayout: '#f5f2eb',
          colorText: '#18211f',
          colorTextSecondary: '#66716d',
          colorBorderSecondary: '#e5e2da',
          borderRadius: 10,
          borderRadiusLG: 16,
          fontFamily:
            "Inter, 'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, sans-serif",
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
