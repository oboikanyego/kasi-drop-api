import mongoose from 'mongoose';
const {Schema,model}=mongoose;
export const ProductModel=model('KasiProduct',new Schema({id:{type:String,unique:true,required:true},name:String,description:String,category:String,price:Number,stock:Number,image:String,tags:[String],featured:Boolean,active:Boolean},{timestamps:true}));
export const UserModel=model('KasiUser',new Schema({email:{type:String,unique:true,lowercase:true,required:true},name:String,passwordHash:String,role:{type:String,enum:['customer','admin'],default:'customer'}},{timestamps:true}));
export const OrderModel=model('KasiOrder',new Schema({id:{type:String,unique:true,required:true},userId:String,email:String,items:[{productId:String,name:String,price:Number,quantity:Number,image:String}],subtotal:Number,shipping:Number,total:Number,status:String,paymentMethod:String,delivery:{name:String,phone:String,address:String,city:String,province:String,postalCode:String},createdAt:Date,paidAt:Date},{timestamps:true}));
