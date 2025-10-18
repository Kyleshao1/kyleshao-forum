import { useEffect, useState } from 'react';
import api from '../api';
import { useSearchParams } from 'react-router-dom';

export default function Verify(){
  const [params] = useSearchParams();
  const [msg, setMsg] = useState('正在验证...');
  useEffect(()=>{ const token = params.get('token'); if(!token){ setMsg('无token'); return; } api.get(`/auth/verify?token=${token}`).then(r=>setMsg('验证成功')).catch(()=>setMsg('验证失败或过期')); },[params]);
  return <div><h2>邮箱验证</h2><p>{msg}</p></div>;
}
