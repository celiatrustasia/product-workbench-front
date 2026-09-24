import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import { WorkspaceProvider } from './data/workspace';
import Root from './root';
import './styles.css';

dayjs.locale('zh-cn');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN} theme={{ token: { colorPrimary: '#2563eb', borderRadius: 6, fontSize: 13, colorText: '#263348', colorBorder: '#dfe5ee', colorBgContainer: '#ffffff' }, components: { Table: { headerBg: '#f9fafc', headerColor: '#7c8799', rowHoverBg: '#f5f8ff' }, Button: { primaryShadow: 'none' } } }}>
      <AntApp>
        <HashRouter><WorkspaceProvider><Root /></WorkspaceProvider></HashRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
