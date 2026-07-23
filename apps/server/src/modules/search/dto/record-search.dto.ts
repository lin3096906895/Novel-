import { IsString, MaxLength, MinLength } from 'class-validator';

export class RecordSearchDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  keyword: string;
}
