import React from 'react';
import {createRoot} from 'react-dom/client';
import {AgentsPage} from '../../../web/src/features/agents/agents-page';
import {DirectMessagePage} from '../../../web/src/features/direct-messages/direct-message-page';
import {TooltipProvider} from '../../../web/src/components/ui/tooltip';
import './style.css';
createRoot(document.getElementById('root')).render(<TooltipProvider>{location.pathname.startsWith('/dm/') ? <DirectMessagePage threadId={location.pathname.split('/').pop()}/> : <AgentsPage/>}</TooltipProvider>);
