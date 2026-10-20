import Skeleton from "../components/skeleton";

export default function Loading() {
  return <Skeleton blocks={["back", "title", "field", "line", "card"]} />;
}
