'use client';
import {useEffect,useRef} from 'react';

const checked=new WeakSet<Event>();
const beforeLeave='rotina:before-leave',confirmedLeave='rotina:leave-confirmed';
export function confirmPageLeave() {
  return document.dispatchEvent(new Event(beforeLeave,{cancelable:true}));
}
export function allowPageLeave() {document.dispatchEvent(new Event(confirmedLeave));}

/** Protect visible navigation and full reload/close. No draft persistence or router/history patching. */
export function useDraftProtection(dirty:boolean,pending=false) {
  const allowed=useRef(false);
  useEffect(()=>{
    if(!dirty && !pending)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    function allow() {allowed.current=true;clearTimeout(timer);timer=setTimeout(()=>{allowed.current=false;},1000);}
    function unload(event:BeforeUnloadEvent) {
      if(allowed.current){allowed.current=false;return;}
      event.preventDefault();event.returnValue='';
    }
    function check(event:Event) {
      if(event.defaultPrevented)return;
      if(event.type==='click') {
        const click=event as MouseEvent;
        if(click.button!==0||click.metaKey||click.ctrlKey||click.shiftKey||click.altKey)return;
        const anchor=(click.target as Element|null)?.closest?.('a[href]') as HTMLAnchorElement|null;
        if(!anchor||anchor.hasAttribute('download')||(anchor.target&&anchor.target!=='_self'))return;
        const destination=new URL(anchor.href,window.location.href),current=new URL(window.location.href);
        if(destination.origin===current.origin&&destination.pathname===current.pathname&&destination.search===current.search)return;
      }
      if(pending) {
        event.preventDefault();event.stopImmediatePropagation();
        window.alert('Aguarde a confirmação do salvamento antes de sair.');return;
      }
      if(checked.has(event)){if(event.type==='click')allow();return;}
      checked.add(event);
      if(!window.confirm('Há alterações não salvas nesta página. Deseja sair e descartá-las?')) {
        event.preventDefault();event.stopImmediatePropagation();return;
      }
      if(event.type==='click')allow();
    }
    document.addEventListener('click',check,true);
    document.addEventListener(beforeLeave,check);
    document.addEventListener(confirmedLeave,allow);
    window.addEventListener('beforeunload',unload);
    return ()=>{clearTimeout(timer);allowed.current=false;document.removeEventListener('click',check,true);document.removeEventListener(beforeLeave,check);document.removeEventListener(confirmedLeave,allow);window.removeEventListener('beforeunload',unload);};
  },[dirty,pending]);
  return ()=>{allowed.current=true;};
}
