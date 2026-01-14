import ArtistRadioPageClient from './ArtistRadioPageClient';

type Params = { id: string };

export const generateStaticParams = async (): Promise<Params[]> => {
  return [];
};

export default function Page() {
  return <ArtistRadioPageClient />;
}
