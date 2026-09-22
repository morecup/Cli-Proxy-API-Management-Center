import { createRoot } from 'react-dom/client';
import i18n from '@/i18n';
import '@/styles/global.scss';
import { StartupDiagnosticsFixture } from './ClaudeDesktopStartupFixture';

void i18n.changeLanguage('zh-CN').then(() => {
  createRoot(document.getElementById('root')!).render(<StartupDiagnosticsFixture />);
});
