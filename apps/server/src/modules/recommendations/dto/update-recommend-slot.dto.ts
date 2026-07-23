import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateRecommendSlotDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  novelIds!: string[];
}
