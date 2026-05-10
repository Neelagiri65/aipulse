import { Composition } from "remotion";
import { DailyBrief } from "./DailyBrief";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="DailyBrief"
      component={DailyBrief}
      durationInFrames={3600}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};
