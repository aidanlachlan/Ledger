import Skeleton from "./components/skeleton";

export default function Loading() {
  return (
    <Skeleton
      blocks={[
        "title",
        "line",
        "card",
        "row",
        "button",
        "button",
        "card",
      ]}
    />
  );
}
