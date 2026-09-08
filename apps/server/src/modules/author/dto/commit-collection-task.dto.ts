import { Equals, IsBoolean } from 'class-validator';

export class CommitCollectionTaskDto {
  @IsBoolean()
  @Equals(true, { message: '必须再次确认作品为公版或已获得明确授权' })
  rightsConfirmed!: true;
}
