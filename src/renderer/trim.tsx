import React from 'react';
import ReactDOM from 'react-dom/client';
import TrimEditor from './components/TrimEditor';
import './styles/global.css';
import './styles/trim.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TrimEditor />
  </React.StrictMode>
);
