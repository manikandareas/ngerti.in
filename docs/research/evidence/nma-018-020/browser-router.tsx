import React from 'react';
export function Link({to,params,children,...props}) {return <a href={params ? '/dm/'+params.threadId : to} {...props}>{children}</a>}
