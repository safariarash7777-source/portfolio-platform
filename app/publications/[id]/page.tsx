import PublicationRead from '@/components/admin/PublicationRead';
export const metadata={title:'محتوای منتشرشده',robots:{index:false,follow:false}};
export default async function Page({params}:{params:Promise<{id:string}>}){return <PublicationRead id={(await params).id}/>;}
