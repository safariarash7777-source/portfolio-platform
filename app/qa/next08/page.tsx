import {notFound} from 'next/navigation';
import PublicationScenario from '@/components/admin/PublicationScenario';
export const dynamic='force-dynamic';
export const metadata={title:'آزمایش محلی NEXT08',robots:{index:false,follow:false}};
export default function Next08Qa(){if(process.env.NODE_ENV!=='development'||process.env.NEXT08_QA!=='1')notFound();return <PublicationScenario/>;}
