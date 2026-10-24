import React from 'react';
import {createRoot} from 'react-dom/client';
import {DirectMessagePage} from '../../../apps/web/src/features/direct-messages/direct-message-page';
import './style.css';
import {GoalProgress} from '../../../apps/web/src/features/direct-messages/goal-progress';
import snapshot from './live.json';
createRoot(document.getElementById('root')).render(location.pathname === '/goal-proof' ? <main className="mx-auto min-h-dvh max-w-3xl bg-background p-6"><GoalProgress goals={snapshot.goals} messages={snapshot.messages} agents={snapshot.thread.agents}/>{snapshot.messages.map(m => <article key={m.message_id} id={'message-'+m.message_id} className="mt-6 text-sm whitespace-pre-wrap">{m.content}</article>)}</main> : <DirectMessagePage threadId={location.pathname.split('/').pop()}/>);
