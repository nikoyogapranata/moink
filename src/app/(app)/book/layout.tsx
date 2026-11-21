import "./book.css";

/** The HSK Book pages: only adds the reader's styles. */
export default function BookLayout({ children }: LayoutProps<"/book">) {
  return children;
}
