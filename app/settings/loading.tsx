import Skeleton from "../components/skeleton";

export default function Loading() {
  return (
    <Skeleton
      blocks={[
        "back",
        "title",
        "line",
        "field",
        "field",
        "field",
        "field",
        "button",
      ]}
    />
  );
}
