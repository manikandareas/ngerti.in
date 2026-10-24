import React from 'react';
function url(to, params) { return params ? '/dm/' + params.threadId : to; }
export function Link({to,params,children,...props}) { return <a href={url(to, params)} {...props}>{children}</a>; }
export const useNavigate = () => ({to, params}) => { location.href = url(to, params); };
