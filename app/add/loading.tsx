import Skeleton from "../components/skeleton";

export default function Loading() {
  return (
    <Skeleton
      blocks={[
        "back",
        "title",
        "field",
        "button",
        "field",
        "field",
        "field",
      ]}
    />
  );
}
