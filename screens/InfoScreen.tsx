import { PageShell } from '../components/PageShell';
import { usePageTheme } from '../hooks/usePageTheme';

type InfoScreenProps = {
  title: string;
};

/**
 * Shell for the secondary pages whose content is not written yet: navigation
 * and the page frame only, so each route already has its own address.
 */
export function InfoScreen({ title }: InfoScreenProps) {
  const isDarkMode = usePageTheme();

  return <PageShell title={title} isDarkMode={isDarkMode} />;
}
