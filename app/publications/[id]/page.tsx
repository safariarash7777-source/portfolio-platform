import PublicationRead from '@/components/admin/PublicationRead';
export const metadata={title:'محتوای منتشرشده',robots:{index:false,follow:false}};
export default async function Page({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{cohort?:string|string[]}>}){
 const [p,q]=await Promise.all([params,searchParams]);
 return <PublicationRead key={`${p.id}:${String(q.cohort??'')}`} id={p.id} cohortId={q.cohort===undefined?undefined:typeof q.cohort==='string'?q.cohort:''}/>;
}
