import ArtistPageClient from './ArtistPageClient';

type Params = { id: string };

export const generateStaticParams = async (): Promise<Params[]> => {
  return [];
};

export default function Page() {
  return <ArtistPageClient />;
}
