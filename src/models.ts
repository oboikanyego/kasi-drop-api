import mongoose from 'mongoose';
const {Schema,model}=mongoose;
export const ProductModel=model('KasiProduct',new Schema({id:{type:String,unique:true,required:true},name:String,description:String,category:String,price:Number,stock:Number,image:String,tags:[String],featured:Boolean,active:Boolean},{timestamps:true}));
const AddressSchema=new Schema({
 id:{type:String,required:true},label:{type:String,enum:['Home','Work','Other'],required:true},
 nickname:String,recipientName:String,phone:String,street:String,unit:String,suburb:String,
 city:String,province:String,postalCode:String,deliveryNotes:String,isDefault:{type:Boolean,default:false}
},{_id:false});
export const UserModel=model('KasiUser',new Schema({phone:{type:String,default:''},about:{type:String,default:''},
 preferredLanguage:{type:String,default:'English'},marketingOptIn:{type:Boolean,default:false},
 addresses:{type:[AddressSchema],default:[]},avatarData:{type:Buffer,select:false},
 avatarMime:String,avatarUpdatedAt:Date,email:{type:String,unique:true,lowercase:true,required:true},name:String,passwordHash:String,role:{type:String,enum:['customer','admin'],default:'customer'},demoSeed:{type:Boolean,default:false}},{timestamps:true}));
export const OrderModel=model('KasiOrder',new Schema({id:{type:String,unique:true,required:true},userId:String,email:String,items:[{productId:String,name:String,price:Number,quantity:Number,image:String}],subtotal:Number,shipping:Number,total:Number,status:String,paymentMethod:String,stockReserved:{type:Boolean,default:false},demoSeed:{type:Boolean,default:false},delivery:{name:String,phone:String,address:String,city:String,province:String,postalCode:String},createdAt:Date,paidAt:Date},{timestamps:true}));
