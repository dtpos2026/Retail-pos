import { createRoot } from 'react-dom/client';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import './styles/app.css';
import './styles/themes.css';
import './styles/extras.css';
import './styles/panel.css';
import App from './App';
import { AdminProvider } from './context';
import VerifyInvoice from './pages/VerifyInvoice';

// An invoice QR opens  …/?verify=CODE  : a public page, no sign-in.
const verify = new URLSearchParams(location.search).get('verify');

createRoot(document.getElementById('root')).render(
  verify ? (
    <AdminProvider><VerifyInvoice code={verify.toUpperCase()} /></AdminProvider>
  ) : (
    <AdminProvider>
      <App />
    </AdminProvider>
  )
);
