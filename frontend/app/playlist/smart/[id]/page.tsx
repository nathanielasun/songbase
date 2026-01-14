import SmartPlaylistPageClient from './SmartPlaylistPageClient';

type Params = { id: string };

export const generateStaticParams = async (): Promise<Params[]> => {
  return [];
};

export default function Page() {
  return <SmartPlaylistPageClient />;
}
