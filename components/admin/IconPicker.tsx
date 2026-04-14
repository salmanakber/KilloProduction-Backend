"use client"

import { useState, useMemo } from "react"
import { Search, X } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import * as IoIcons from "react-icons/io5"
import * as MdIcons from "react-icons/md"
import * as FaIcons from "react-icons/fa"
import * as FiIcons from "react-icons/fi"
import * as AiIcons from "react-icons/ai"
import * as BsIcons from "react-icons/bs"
import * as HiIcons from "react-icons/hi"
import * as Hi2Icons from "react-icons/hi2"
import * as TbIcons from "react-icons/tb"
import * as BiIcons from "react-icons/bi"
import * as GiIcons from "react-icons/gi"
import * as RiIcons from "react-icons/ri"

interface IconPickerProps {
  value?: string
  onSelect: (iconName: string) => void
  onClose: () => void
  open: boolean
}

// Helper function to safely get icon and filter out undefined ones
const createIconList = (icons: Array<{ name: string; icon: any }>, library: string) => {
  return icons
    .filter((item) => item.icon !== undefined)
    .map((item) => ({ ...item, library }))
}

// Curated list of popular icons from Ionicons
const IONICONS = createIconList(
  [
    { name: "IoHome", icon: IoIcons.IoHome },
    { name: "IoStorefront", icon: IoIcons.IoStorefront },
    { name: "IoCarSport", icon: IoIcons.IoCarSport },
    { name: "IoMedical", icon: IoIcons.IoMedical },
    { name: "IoRestaurant", icon: IoIcons.IoRestaurant },
    { name: "IoBag", icon: IoIcons.IoBag },
    { name: "IoBicycle", icon: IoIcons.IoBicycle },
    { name: "IoFastFood", icon: IoIcons.IoFastFood },
    { name: "IoFitness", icon: IoIcons.IoFitness },
    { name: "IoGameController", icon: IoIcons.IoGameController },
    { name: "IoGift", icon: IoIcons.IoGift },
    { name: "IoHardwareChip", icon: IoIcons.IoHardwareChip },
    { name: "IoHeart", icon: IoIcons.IoHeart },
    { name: "IoMusicalNote", icon: IoIcons.IoMusicalNote },
    { name: "IoPaw", icon: IoIcons.IoPaw },
    { name: "IoShirt", icon: IoIcons.IoShirt },
    { name: "IoSparkles", icon: IoIcons.IoSparkles },
    { name: "IoTennisball", icon: IoIcons.IoTennisball },
    { name: "IoWatch", icon: IoIcons.IoWatch },
    { name: "IoWine", icon: IoIcons.IoWine },
    { name: "IoBuild", icon: IoIcons.IoBuild },
    { name: "IoConstruct", icon: IoIcons.IoConstruct },
    { name: "IoHammer", icon: IoIcons.IoHammer },
    { name: "IoFlash", icon: IoIcons.IoFlash },
    { name: "IoFlower", icon: IoIcons.IoFlower },
    { name: "IoLeaf", icon: IoIcons.IoLeaf },
    { name: "IoNutrition", icon: IoIcons.IoNutrition },
    { name: "IoBasket", icon: IoIcons.IoBasket },
    { name: "IoCart", icon: IoIcons.IoCart },
    { name: "IoCard", icon: IoIcons.IoCard },
    { name: "IoWallet", icon: IoIcons.IoWallet },
    { name: "IoPhonePortrait", icon: IoIcons.IoPhonePortrait },
    { name: "IoDesktop", icon: IoIcons.IoDesktop },
    { name: "IoTabletPortrait", icon: IoIcons.IoTabletPortrait },
    { name: "IoHeadset", icon: IoIcons.IoHeadset },
    { name: "IoCamera", icon: IoIcons.IoCamera },
    { name: "IoVideocam", icon: IoIcons.IoVideocam },
    { name: "IoBook", icon: IoIcons.IoBook },
    { name: "IoSchool", icon: IoIcons.IoSchool },
    { name: "IoBusiness", icon: IoIcons.IoBusiness },
    { name: "IoAirplane", icon: IoIcons.IoAirplane },
    { name: "IoCar", icon: IoIcons.IoCar },
    { name: "IoBoat", icon: IoIcons.IoBoat },
    { name: "IoTrain", icon: IoIcons.IoTrain },
    { name: "IoBus", icon: IoIcons.IoBus },
    { name: "IoLocation", icon: IoIcons.IoLocation },
    { name: "IoMap", icon: IoIcons.IoMap },
    { name: "IoGlobe", icon: IoIcons.IoGlobe },
    { name: "IoPlanet", icon: IoIcons.IoPlanet },
    { name: "IoStar", icon: IoIcons.IoStar },
    { name: "IoMoon", icon: IoIcons.IoMoon },
    { name: "IoSunny", icon: IoIcons.IoSunny },
    { name: "IoCloud", icon: IoIcons.IoCloud },
    { name: "IoRainy", icon: IoIcons.IoRainy },
    { name: "IoThunderstorm", icon: IoIcons.IoThunderstorm },
    { name: "IoSnow", icon: IoIcons.IoSnow },
    { name: "IoWater", icon: IoIcons.IoWater },
    { name: "IoFlame", icon: IoIcons.IoFlame },
    { name: "IoColorPalette", icon: IoIcons.IoColorPalette },
    { name: "IoBrush", icon: IoIcons.IoBrush },
    { name: "IoImage", icon: IoIcons.IoImage },
    { name: "IoImages", icon: IoIcons.IoImages },
    { name: "IoMusicalNotes", icon: IoIcons.IoMusicalNotes },
    { name: "IoVolumeHigh", icon: IoIcons.IoVolumeHigh },
    { name: "IoPlay", icon: IoIcons.IoPlay },
    { name: "IoPause", icon: IoIcons.IoPause },
    { name: "IoHeartOutline", icon: IoIcons.IoHeartOutline },
    { name: "IoThumbsUp", icon: IoIcons.IoThumbsUp },
    { name: "IoShareSocial", icon: IoIcons.IoShareSocial },
    { name: "IoChatbubble", icon: IoIcons.IoChatbubble },
    { name: "IoMail", icon: IoIcons.IoMail },
    { name: "IoNotifications", icon: IoIcons.IoNotifications },
    { name: "IoLockClosed", icon: IoIcons.IoLockClosed },
    { name: "IoShield", icon: IoIcons.IoShield },
    { name: "IoWarning", icon: IoIcons.IoWarning },
    { name: "IoCheckmarkCircle", icon: IoIcons.IoCheckmarkCircle },
    { name: "IoCloseCircle", icon: IoIcons.IoCloseCircle },
    { name: "IoInformationCircle", icon: IoIcons.IoInformationCircle },
    { name: "IoHelpCircle", icon: IoIcons.IoHelpCircle },
    { name: "IoAddCircle", icon: IoIcons.IoAddCircle },
    { name: "IoTrash", icon: IoIcons.IoTrash },
    { name: "IoCopy", icon: IoIcons.IoCopy },
    { name: "IoDownload", icon: IoIcons.IoDownload },
    { name: "IoUpload", icon: IoIcons.IoUpload },
    { name: "IoLink", icon: IoIcons.IoLink },
    { name: "IoSearch", icon: IoIcons.IoSearch },
    { name: "IoFilter", icon: IoIcons.IoFilter },
    { name: "IoMenu", icon: IoIcons.IoMenu },
    { name: "IoGrid", icon: IoIcons.IoGrid },
    { name: "IoList", icon: IoIcons.IoList },
    { name: "IoApps", icon: IoIcons.IoApps },
  ],
  "Ionicons"
)

// Curated list of popular icons from Material Icons
const MATERIAL_ICONS = createIconList(
  [
    { name: "MdHome", icon: MdIcons.MdHome },
    { name: "MdStore", icon: MdIcons.MdStore },
    { name: "MdShoppingCart", icon: MdIcons.MdShoppingCart },
    { name: "MdShoppingBag", icon: MdIcons.MdShoppingBag },
    { name: "MdLocalGroceryStore", icon: MdIcons.MdLocalGroceryStore },
    { name: "MdRestaurant", icon: MdIcons.MdRestaurant },
    { name: "MdFastfood", icon: MdIcons.MdFastfood },
    { name: "MdLocalPharmacy", icon: MdIcons.MdLocalPharmacy },
    { name: "MdHealing", icon: MdIcons.MdHealing },
    { name: "MdLocalHospital", icon: MdIcons.MdLocalHospital },
    { name: "MdMedicalServices", icon: MdIcons.MdMedicalServices },
    { name: "MdHealthAndSafety", icon: MdIcons.MdHealthAndSafety },
    { name: "MdDirectionsCar", icon: MdIcons.MdDirectionsCar },
    { name: "MdDirectionsBike", icon: MdIcons.MdDirectionsBike },
    { name: "MdTwoWheeler", icon: MdIcons.MdTwoWheeler },
    { name: "MdElectricBike", icon: MdIcons.MdElectricBike },
    { name: "MdFlight", icon: MdIcons.MdFlight },
    { name: "MdTrain", icon: MdIcons.MdTrain },
    { name: "MdDirectionsBus", icon: MdIcons.MdDirectionsBus },
    { name: "MdLocalTaxi", icon: MdIcons.MdLocalTaxi },
    { name: "MdBuild", icon: MdIcons.MdBuild },
    { name: "MdConstruction", icon: MdIcons.MdConstruction },
    { name: "MdHandyman", icon: MdIcons.MdHandyman },
    { name: "MdHomeRepairService", icon: MdIcons.MdHomeRepairService },
    { name: "MdCarRepair", icon: MdIcons.MdCarRepair },
    { name: "MdSports", icon: MdIcons.MdSports },
    { name: "MdFitnessCenter", icon: MdIcons.MdFitnessCenter },
    { name: "MdMusicNote", icon: MdIcons.MdMusicNote },
    { name: "MdLibraryMusic", icon: MdIcons.MdLibraryMusic },
    { name: "MdHeadphones", icon: MdIcons.MdHeadphones },
    { name: "MdMovie", icon: MdIcons.MdMovie },
    { name: "MdTv", icon: MdIcons.MdTv },
    { name: "MdComputer", icon: MdIcons.MdComputer },
    { name: "MdLaptop", icon: MdIcons.MdLaptop },
    { name: "MdPhoneAndroid", icon: MdIcons.MdPhoneAndroid },
    { name: "MdTablet", icon: MdIcons.MdTablet },
    { name: "MdWatch", icon: MdIcons.MdWatch },
    { name: "MdCamera", icon: MdIcons.MdCamera },
    { name: "MdPhotoCamera", icon: MdIcons.MdPhotoCamera },
    { name: "MdVideocam", icon: MdIcons.MdVideocam },
    { name: "MdImage", icon: MdIcons.MdImage },
    { name: "MdPalette", icon: MdIcons.MdPalette },
    { name: "MdBrush", icon: MdIcons.MdBrush },
    { name: "MdBook", icon: MdIcons.MdBook },
    { name: "MdSchool", icon: MdIcons.MdSchool },
    { name: "MdBusiness", icon: MdIcons.MdBusiness },
    { name: "MdWork", icon: MdIcons.MdWork },
    { name: "MdAccountBalanceWallet", icon: MdIcons.MdAccountBalanceWallet },
    { name: "MdCreditCard", icon: MdIcons.MdCreditCard },
    { name: "MdPayment", icon: MdIcons.MdPayment },
    { name: "MdShoppingBasket", icon: MdIcons.MdShoppingBasket },
    { name: "MdLocalOffer", icon: MdIcons.MdLocalOffer },
    { name: "MdFavorite", icon: MdIcons.MdFavorite },
    { name: "MdFavoriteBorder", icon: MdIcons.MdFavoriteBorder },
    { name: "MdThumbUp", icon: MdIcons.MdThumbUp },
    { name: "MdThumbDown", icon: MdIcons.MdThumbDown },
    { name: "MdShare", icon: MdIcons.MdShare },
    { name: "MdChat", icon: MdIcons.MdChat },
    { name: "MdEmail", icon: MdIcons.MdEmail },
    { name: "MdNotifications", icon: MdIcons.MdNotifications },
    { name: "MdLock", icon: MdIcons.MdLock },
    { name: "MdLockOpen", icon: MdIcons.MdLockOpen },
    { name: "MdSecurity", icon: MdIcons.MdSecurity },
    { name: "MdWarning", icon: MdIcons.MdWarning },
    { name: "MdCheckCircle", icon: MdIcons.MdCheckCircle },
    { name: "MdCancel", icon: MdIcons.MdCancel },
    { name: "MdInfo", icon: MdIcons.MdInfo },
    { name: "MdHelp", icon: MdIcons.MdHelp },
    { name: "MdAddCircle", icon: MdIcons.MdAddCircle },
    { name: "MdDelete", icon: MdIcons.MdDelete },
    { name: "MdEdit", icon: MdIcons.MdEdit },
    { name: "MdContentCopy", icon: MdIcons.MdContentCopy },
    { name: "MdDownload", icon: MdIcons.MdDownload },
    { name: "MdUpload", icon: MdIcons.MdUpload },
    { name: "MdLink", icon: MdIcons.MdLink },
    { name: "MdSearch", icon: MdIcons.MdSearch },
    { name: "MdFilterList", icon: MdIcons.MdFilterList },
    { name: "MdMenu", icon: MdIcons.MdMenu },
    { name: "MdGridView", icon: MdIcons.MdGridView },
    { name: "MdList", icon: MdIcons.MdList },
    { name: "MdApps", icon: MdIcons.MdApps },
  ],
  "Material"
)

// FontAwesome Icons
const FONTAWESOME_ICONS = createIconList(
  [
    { name: "FaHome", icon: FaIcons.FaHome },
    { name: "FaStore", icon: FaIcons.FaStore },
    { name: "FaShoppingCart", icon: FaIcons.FaShoppingCart },
    { name: "FaShoppingBag", icon: FaIcons.FaShoppingBag },
    { name: "FaCar", icon: FaIcons.FaCar },
    { name: "FaMotorcycle", icon: FaIcons.FaMotorcycle },
    { name: "FaBicycle", icon: FaIcons.FaBicycle },
    { name: "FaUtensils", icon: FaIcons.FaUtensils },
    { name: "FaPizzaSlice", icon: FaIcons.FaPizzaSlice },
    { name: "FaHamburger", icon: FaIcons.FaHamburger },
    { name: "FaCoffee", icon: FaIcons.FaCoffee },
    { name: "FaPills", icon: FaIcons.FaPills },
    { name: "FaHeartbeat", icon: FaIcons.FaHeartbeat },
    { name: "FaHospital", icon: FaIcons.FaHospital },
    { name: "FaWrench", icon: FaIcons.FaWrench },
    { name: "FaTools", icon: FaIcons.FaTools },
    { name: "FaHammer", icon: FaIcons.FaHammer },
    { name: "FaCog", icon: FaIcons.FaCog },
    { name: "FaCogs", icon: FaIcons.FaCogs },
    { name: "FaDumbbell", icon: FaIcons.FaDumbbell },
    { name: "FaFootballBall", icon: FaIcons.FaFootballBall },
    { name: "FaBasketballBall", icon: FaIcons.FaBasketballBall },
    { name: "FaMusic", icon: FaIcons.FaMusic },
    { name: "FaHeadphones", icon: FaIcons.FaHeadphones },
    { name: "FaFilm", icon: FaIcons.FaFilm },
    { name: "FaTv", icon: FaIcons.FaTv },
    { name: "FaLaptop", icon: FaIcons.FaLaptop },
    { name: "FaMobile", icon: FaIcons.FaMobile },
    { name: "FaTablet", icon: FaIcons.FaTablet },
    { name: "FaCamera", icon: FaIcons.FaCamera },
    { name: "FaImage", icon: FaIcons.FaImage },
    { name: "FaPalette", icon: FaIcons.FaPalette },
    { name: "FaBook", icon: FaIcons.FaBook },
    { name: "FaGraduationCap", icon: FaIcons.FaGraduationCap },
    { name: "FaBriefcase", icon: FaIcons.FaBriefcase },
    { name: "FaWallet", icon: FaIcons.FaWallet },
    { name: "FaCreditCard", icon: FaIcons.FaCreditCard },
    { name: "FaMoneyBill", icon: FaIcons.FaMoneyBill },
    { name: "FaHeart", icon: FaIcons.FaHeart },
    { name: "FaThumbsUp", icon: FaIcons.FaThumbsUp },
    { name: "FaShare", icon: FaIcons.FaShare },
    { name: "FaComments", icon: FaIcons.FaComments },
    { name: "FaEnvelope", icon: FaIcons.FaEnvelope },
    { name: "FaBell", icon: FaIcons.FaBell },
    { name: "FaLock", icon: FaIcons.FaLock },
    { name: "FaShieldAlt", icon: FaIcons.FaShieldAlt },
    { name: "FaExclamationTriangle", icon: FaIcons.FaExclamationTriangle },
    { name: "FaCheckCircle", icon: FaIcons.FaCheckCircle },
    { name: "FaTimesCircle", icon: FaIcons.FaTimesCircle },
    { name: "FaInfoCircle", icon: FaIcons.FaInfoCircle },
    { name: "FaQuestionCircle", icon: FaIcons.FaQuestionCircle },
    { name: "FaPlusCircle", icon: FaIcons.FaPlusCircle },
    { name: "FaTrash", icon: FaIcons.FaTrash },
    { name: "FaEdit", icon: FaIcons.FaEdit },
    { name: "FaCopy", icon: FaIcons.FaCopy },
    { name: "FaDownload", icon: FaIcons.FaDownload },
    { name: "FaUpload", icon: FaIcons.FaUpload },
    { name: "FaLink", icon: FaIcons.FaLink },
    { name: "FaSearch", icon: FaIcons.FaSearch },
    { name: "FaFilter", icon: FaIcons.FaFilter },
    { name: "FaBars", icon: FaIcons.FaBars },
    { name: "FaTh", icon: FaIcons.FaTh },
    { name: "FaLayerGroup", icon: FaIcons.FaLayerGroup },
  ],
  "FontAwesome"
)


// Feather Icons
const FEATHER_ICONS = createIconList(
  [
    { name: "FiHome", icon: FiIcons.FiHome },
    { name: "FiShoppingCart", icon: FiIcons.FiShoppingCart },
    { name: "FiShoppingBag", icon: FiIcons.FiShoppingBag },
    { name: "FiPackage", icon: FiIcons.FiPackage },
    { name: "FiTruck", icon: FiIcons.FiTruck },
    { name: "FiCar", icon: FiIcons.FiCar },
    { name: "FiBike", icon: FiIcons.FiBike },
    { name: "FiCoffee", icon: FiIcons.FiCoffee },
    { name: "FiHeart", icon: FiIcons.FiHeart },
    { name: "FiActivity", icon: FiIcons.FiActivity },
    { name: "FiBriefcase", icon: FiIcons.FiBriefcase },
    { name: "FiBook", icon: FiIcons.FiBook },
    { name: "FiCamera", icon: FiIcons.FiCamera },
    { name: "FiImage", icon: FiIcons.FiImage },
    { name: "FiMusic", icon: FiIcons.FiMusic },
    { name: "FiHeadphones", icon: FiIcons.FiHeadphones },
    { name: "FiFilm", icon: FiIcons.FiFilm },
    { name: "FiTv", icon: FiIcons.FiTv },
    { name: "FiMonitor", icon: FiIcons.FiMonitor },
    { name: "FiSmartphone", icon: FiIcons.FiSmartphone },
    { name: "FiTablet", icon: FiIcons.FiTablet },
    { name: "FiWatch", icon: FiIcons.FiWatch },
    { name: "FiPalette", icon: FiIcons.FiPalette },
    { name: "FiTool", icon: FiIcons.FiTool },
    { name: "FiSettings", icon: FiIcons.FiSettings },
    { name: "FiWrench", icon: FiIcons.FiWrench },
    { name: "FiDroplet", icon: FiIcons.FiDroplet },
    { name: "FiZap", icon: FiIcons.FiZap },
    { name: "FiSun", icon: FiIcons.FiSun },
    { name: "FiMoon", icon: FiIcons.FiMoon },
    { name: "FiStar", icon: FiIcons.FiStar },
    { name: "FiMapPin", icon: FiIcons.FiMapPin },
    { name: "FiMap", icon: FiIcons.FiMap },
    { name: "FiGlobe", icon: FiIcons.FiGlobe },
    { name: "FiMail", icon: FiIcons.FiMail },
    { name: "FiMessageCircle", icon: FiIcons.FiMessageCircle },
    { name: "FiBell", icon: FiIcons.FiBell },
    { name: "FiLock", icon: FiIcons.FiLock },
    { name: "FiUnlock", icon: FiIcons.FiUnlock },
    { name: "FiShield", icon: FiIcons.FiShield },
    { name: "FiAlertCircle", icon: FiIcons.FiAlertCircle },
    { name: "FiCheckCircle", icon: FiIcons.FiCheckCircle },
    { name: "FiXCircle", icon: FiIcons.FiXCircle },
    { name: "FiInfo", icon: FiIcons.FiInfo },
    { name: "FiHelpCircle", icon: FiIcons.FiHelpCircle },
    { name: "FiPlusCircle", icon: FiIcons.FiPlusCircle },
    { name: "FiMinusCircle", icon: FiIcons.FiMinusCircle },
    { name: "FiTrash2", icon: FiIcons.FiTrash2 },
    { name: "FiEdit", icon: FiIcons.FiEdit },
    { name: "FiCopy", icon: FiIcons.FiCopy },
    { name: "FiDownload", icon: FiIcons.FiDownload },
    { name: "FiUpload", icon: FiIcons.FiUpload },
    { name: "FiLink", icon: FiIcons.FiLink },
    { name: "FiSearch", icon: FiIcons.FiSearch },
    { name: "FiFilter", icon: FiIcons.FiFilter },
    { name: "FiMenu", icon: FiIcons.FiMenu },
    { name: "FiGrid", icon: FiIcons.FiGrid },
    { name: "FiList", icon: FiIcons.FiList },
    { name: "FiLayers", icon: FiIcons.FiLayers },
  ],
  "Feather"
)

// AntDesign Icons
const ANTDESIGN_ICONS = createIconList(
  [
    { name: "AiHome", icon: AiIcons.AiOutlineHome },
    { name: "AiShop", icon: AiIcons.AiOutlineShop },
    { name: "AiShoppingCart", icon: AiIcons.AiOutlineShoppingCart },
    { name: "AiShopping", icon: AiIcons.AiOutlineShopping },
    { name: "AiCar", icon: AiIcons.AiOutlineCar },
    { name: "AiCoffee", icon: AiIcons.AiOutlineCoffee },
    { name: "AiHeart", icon: AiIcons.AiOutlineHeart },
    { name: "AiThunderbolt", icon: AiIcons.AiOutlineThunderbolt },
    { name: "AiTool", icon: AiIcons.AiOutlineTool },
    { name: "AiSetting", icon: AiIcons.AiOutlineSetting },
    { name: "AiCamera", icon: AiIcons.AiOutlineCamera },
    { name: "AiPicture", icon: AiIcons.AiOutlinePicture },
    { name: "AiMusic", icon: AiIcons.AiOutlineMusic },
    { name: "AiVideoCamera", icon: AiIcons.AiOutlineVideoCamera },
    { name: "AiLaptop", icon: AiIcons.AiOutlineLaptop },
    { name: "AiMobile", icon: AiIcons.AiOutlineMobile },
    { name: "AiTablet", icon: AiIcons.AiOutlineTablet },
    { name: "AiBook", icon: AiIcons.AiOutlineBook },
    { name: "AiRead", icon: AiIcons.AiOutlineRead },
    { name: "AiWallet", icon: AiIcons.AiOutlineWallet },
    { name: "AiCreditCard", icon: AiIcons.AiOutlineCreditCard },
    { name: "AiDollar", icon: AiIcons.AiOutlineDollar },
    { name: "AiMail", icon: AiIcons.AiOutlineMail },
    { name: "AiMessage", icon: AiIcons.AiOutlineMessage },
    { name: "AiBell", icon: AiIcons.AiOutlineBell },
    { name: "AiLock", icon: AiIcons.AiOutlineLock },
    { name: "AiSafety", icon: AiIcons.AiOutlineSafety },
    { name: "AiWarning", icon: AiIcons.AiOutlineWarning },
    { name: "AiCheckCircle", icon: AiIcons.AiOutlineCheckCircle },
    { name: "AiCloseCircle", icon: AiIcons.AiOutlineCloseCircle },
    { name: "AiInfoCircle", icon: AiIcons.AiOutlineInfoCircle },
    { name: "AiQuestionCircle", icon: AiIcons.AiOutlineQuestionCircle },
    { name: "AiPlusCircle", icon: AiIcons.AiOutlinePlusCircle },
    { name: "AiMinusCircle", icon: AiIcons.AiOutlineMinusCircle },
    { name: "AiDelete", icon: AiIcons.AiOutlineDelete },
    { name: "AiEdit", icon: AiIcons.AiOutlineEdit },
    { name: "AiCopy", icon: AiIcons.AiOutlineCopy },
    { name: "AiDownload", icon: AiIcons.AiOutlineDownload },
    { name: "AiUpload", icon: AiIcons.AiOutlineUpload },
    { name: "AiLink", icon: AiIcons.AiOutlineLink },
    { name: "AiSearch", icon: AiIcons.AiOutlineSearch },
    { name: "AiFilter", icon: AiIcons.AiOutlineFilter },
    { name: "AiMenu", icon: AiIcons.AiOutlineMenu },
    { name: "AiAppstore", icon: AiIcons.AiOutlineAppstore },
  ],
  "AntDesign"
)

// Bootstrap Icons
const BOOTSTRAP_ICONS = createIconList(
  [
    { name: "BsHouse", icon: BsIcons.BsHouse },
    { name: "BsShop", icon: BsIcons.BsShop },
    { name: "BsCart", icon: BsIcons.BsCart },
    { name: "BsBag", icon: BsIcons.BsBag },
    { name: "BsCarFront", icon: BsIcons.BsCarFront },
    { name: "BsBicycle", icon: BsIcons.BsBicycle },
    { name: "BsCup", icon: BsIcons.BsCup },
    { name: "BsHeart", icon: BsIcons.BsHeart },
    { name: "BsLightning", icon: BsIcons.BsLightning },
    { name: "BsTools", icon: BsIcons.BsTools },
    { name: "BsGear", icon: BsIcons.BsGear },
    { name: "BsCamera", icon: BsIcons.BsCamera },
    { name: "BsImage", icon: BsIcons.BsImage },
    { name: "BsMusicNote", icon: BsIcons.BsMusicNote },
    { name: "BsHeadphones", icon: BsIcons.BsHeadphones },
    { name: "BsFilm", icon: BsIcons.BsFilm },
    { name: "BsTv", icon: BsIcons.BsTv },
    { name: "BsLaptop", icon: BsIcons.BsLaptop },
    { name: "BsPhone", icon: BsIcons.BsPhone },
    { name: "BsTablet", icon: BsIcons.BsTablet },
    { name: "BsWatch", icon: BsIcons.BsWatch },
    { name: "BsPalette", icon: BsIcons.BsPalette },
    { name: "BsBook", icon: BsIcons.BsBook },
    { name: "BsGraduationCap", icon: BsIcons.BsGraduationCap },
    { name: "BsBriefcase", icon: BsIcons.BsBriefcase },
    { name: "BsWallet", icon: BsIcons.BsWallet },
    { name: "BsCreditCard", icon: BsIcons.BsCreditCard },
    { name: "BsCashCoin", icon: BsIcons.BsCashCoin },
    { name: "BsEnvelope", icon: BsIcons.BsEnvelope },
    { name: "BsChat", icon: BsIcons.BsChat },
    { name: "BsBell", icon: BsIcons.BsBell },
    { name: "BsLock", icon: BsIcons.BsLock },
    { name: "BsShield", icon: BsIcons.BsShield },
    { name: "BsExclamationTriangle", icon: BsIcons.BsExclamationTriangle },
    { name: "BsCheckCircle", icon: BsIcons.BsCheckCircle },
    { name: "BsXCircle", icon: BsIcons.BsXCircle },
    { name: "BsInfoCircle", icon: BsIcons.BsInfoCircle },
    { name: "BsQuestionCircle", icon: BsIcons.BsQuestionCircle },
    { name: "BsPlusCircle", icon: BsIcons.BsPlusCircle },
    { name: "BsDashCircle", icon: BsIcons.BsDashCircle },
    { name: "BsTrash", icon: BsIcons.BsTrash },
    { name: "BsPencil", icon: BsIcons.BsPencil },
    { name: "BsCopy", icon: BsIcons.BsCopy },
    { name: "BsDownload", icon: BsIcons.BsDownload },
    { name: "BsUpload", icon: BsIcons.BsUpload },
    { name: "BsLink45deg", icon: BsIcons.BsLink45deg },
    { name: "BsSearch", icon: BsIcons.BsSearch },
    { name: "BsFilter", icon: BsIcons.BsFilter },
    { name: "BsList", icon: BsIcons.BsList },
    { name: "BsGrid", icon: BsIcons.BsGrid },
    { name: "BsApp", icon: BsIcons.BsApp },
  ],
  "Bootstrap"
)

// HeroIcons
const HEROICONS = createIconList(
  [
    { name: "HiHome", icon: HiIcons.HiHome },
    { name: "HiShoppingCart", icon: HiIcons.HiShoppingCart },
    { name: "HiShoppingBag", icon: HiIcons.HiShoppingBag },
    { name: "HiTruck", icon: HiIcons.HiTruck },
    { name: "HiHeart", icon: HiIcons.HiHeart },
    { name: "HiBriefcase", icon: HiIcons.HiBriefcase },
    { name: "HiBook", icon: HiIcons.HiBook },
    { name: "HiCamera", icon: HiIcons.HiCamera },
    { name: "HiPhotograph", icon: HiIcons.HiPhotograph },
    { name: "HiMusicNote", icon: HiIcons.HiMusicNote },
    { name: "HiDesktopComputer", icon: HiIcons.HiDesktopComputer },
    { name: "HiDeviceMobile", icon: HiIcons.HiDeviceMobile },
    { name: "HiTablet", icon: HiIcons.HiTablet },
    { name: "HiColorSwatch", icon: HiIcons.HiColorSwatch },
    { name: "HiCog", icon: HiIcons.HiCog },
    { name: "HiWrench", icon: HiIcons.HiWrench },
    { name: "HiLightningBolt", icon: HiIcons.HiLightningBolt },
    { name: "HiSun", icon: HiIcons.HiSun },
    { name: "HiMoon", icon: HiIcons.HiMoon },
    { name: "HiStar", icon: HiIcons.HiStar },
    { name: "HiLocationMarker", icon: HiIcons.HiLocationMarker },
    { name: "HiMap", icon: HiIcons.HiMap },
    { name: "HiGlobe", icon: HiIcons.HiGlobe },
    { name: "HiMail", icon: HiIcons.HiMail },
    { name: "HiChat", icon: HiIcons.HiChat },
    { name: "HiBell", icon: HiIcons.HiBell },
    { name: "HiLockClosed", icon: HiIcons.HiLockClosed },
    { name: "HiShieldCheck", icon: HiIcons.HiShieldCheck },
    { name: "HiExclamation", icon: HiIcons.HiExclamation },
    { name: "HiCheckCircle", icon: HiIcons.HiCheckCircle },
    { name: "HiXCircle", icon: HiIcons.HiXCircle },
    { name: "HiInformationCircle", icon: HiIcons.HiInformationCircle },
    { name: "HiQuestionMarkCircle", icon: HiIcons.HiQuestionMarkCircle },
    { name: "HiPlusCircle", icon: HiIcons.HiPlusCircle },
    { name: "HiMinusCircle", icon: HiIcons.HiMinusCircle },
    { name: "HiTrash", icon: HiIcons.HiTrash },
    { name: "HiPencil", icon: HiIcons.HiPencil },
    { name: "HiDuplicate", icon: HiIcons.HiDuplicate },
    { name: "HiDownload", icon: HiIcons.HiDownload },
    { name: "HiUpload", icon: HiIcons.HiUpload },
    { name: "HiLink", icon: HiIcons.HiLink },
    { name: "HiSearch", icon: HiIcons.HiSearch },
    { name: "HiFilter", icon: HiIcons.HiFilter },
    { name: "HiMenu", icon: HiIcons.HiMenu },
    { name: "HiViewGrid", icon: HiIcons.HiViewGrid },
    { name: "HiViewList", icon: HiIcons.HiViewList },
  ],
  "HeroIcons"
)

// HeroIcons v2
const HEROICONS2 = createIconList(
  [
    { name: "Hi2Home", icon: Hi2Icons.HiHome },
    { name: "Hi2ShoppingCart", icon: Hi2Icons.HiShoppingCart },
    { name: "Hi2ShoppingBag", icon: Hi2Icons.HiShoppingBag },
    { name: "Hi2Truck", icon: Hi2Icons.HiTruck },
    { name: "Hi2Heart", icon: Hi2Icons.HiHeart },
    { name: "Hi2Briefcase", icon: Hi2Icons.HiBriefcase },
    { name: "Hi2Book", icon: Hi2Icons.HiBook },
    { name: "Hi2Camera", icon: Hi2Icons.HiCamera },
    { name: "Hi2Photo", icon: Hi2Icons.HiPhoto },
    { name: "Hi2MusicalNote", icon: Hi2Icons.HiMusicalNote },
    { name: "Hi2ComputerDesktop", icon: Hi2Icons.HiComputerDesktop },
    { name: "Hi2DevicePhoneMobile", icon: Hi2Icons.HiDevicePhoneMobile },
    { name: "Hi2DeviceTablet", icon: Hi2Icons.HiDeviceTablet },
    { name: "Hi2Swatch", icon: Hi2Icons.HiSwatch },
    { name: "Hi2Cog6Tooth", icon: Hi2Icons.HiCog6Tooth },
    { name: "Hi2Wrench", icon: Hi2Icons.HiWrench },
    { name: "Hi2Bolt", icon: Hi2Icons.HiBolt },
    { name: "Hi2Sun", icon: Hi2Icons.HiSun },
    { name: "Hi2Moon", icon: Hi2Icons.HiMoon },
    { name: "Hi2Star", icon: Hi2Icons.HiStar },
    { name: "Hi2MapPin", icon: Hi2Icons.HiMapPin },
    { name: "Hi2Map", icon: Hi2Icons.HiMap },
    { name: "Hi2GlobeAlt", icon: Hi2Icons.HiGlobeAlt },
    { name: "Hi2Envelope", icon: Hi2Icons.HiEnvelope },
    { name: "Hi2ChatBubbleLeft", icon: Hi2Icons.HiChatBubbleLeft },
    { name: "Hi2Bell", icon: Hi2Icons.HiBell },
    { name: "Hi2LockClosed", icon: Hi2Icons.HiLockClosed },
    { name: "Hi2ShieldCheck", icon: Hi2Icons.HiShieldCheck },
    { name: "Hi2ExclamationTriangle", icon: Hi2Icons.HiExclamationTriangle },
    { name: "Hi2CheckCircle", icon: Hi2Icons.HiCheckCircle },
    { name: "Hi2XCircle", icon: Hi2Icons.HiXCircle },
    { name: "Hi2InformationCircle", icon: Hi2Icons.HiInformationCircle },
    { name: "Hi2QuestionMarkCircle", icon: Hi2Icons.HiQuestionMarkCircle },
    { name: "Hi2PlusCircle", icon: Hi2Icons.HiPlusCircle },
    { name: "Hi2MinusCircle", icon: Hi2Icons.HiMinusCircle },
    { name: "Hi2Trash", icon: Hi2Icons.HiTrash },
    { name: "Hi2Pencil", icon: Hi2Icons.HiPencil },
    { name: "Hi2DocumentDuplicate", icon: Hi2Icons.HiDocumentDuplicate },
    { name: "Hi2ArrowDownTray", icon: Hi2Icons.HiArrowDownTray },
    { name: "Hi2ArrowUpTray", icon: Hi2Icons.HiArrowUpTray },
    { name: "Hi2Link", icon: Hi2Icons.HiLink },
    { name: "Hi2MagnifyingGlass", icon: Hi2Icons.HiMagnifyingGlass },
    { name: "Hi2Funnel", icon: Hi2Icons.HiFunnel },
    { name: "Hi2Bars3", icon: Hi2Icons.HiBars3 },
    { name: "Hi2Squares2X2", icon: Hi2Icons.HiSquares2X2 },
    { name: "Hi2Bars3BottomLeft", icon: Hi2Icons.HiBars3BottomLeft },
  ],
  "HeroIcons2"
)

// Tabler Icons
const TABLER_ICONS = createIconList(
  [
    { name: "TbHome", icon: TbIcons.TbHome },
    { name: "TbShoppingCart", icon: TbIcons.TbShoppingCart },
    { name: "TbShoppingBag", icon: TbIcons.TbShoppingBag },
    { name: "TbTruck", icon: TbIcons.TbTruck },
    { name: "TbCar", icon: TbIcons.TbCar },
    { name: "TbBike", icon: TbIcons.TbBike },
    { name: "TbCoffee", icon: TbIcons.TbCoffee },
    { name: "TbHeart", icon: TbIcons.TbHeart },
    { name: "TbBriefcase", icon: TbIcons.TbBriefcase },
    { name: "TbBook", icon: TbIcons.TbBook },
    { name: "TbCamera", icon: TbIcons.TbCamera },
    { name: "TbPhoto", icon: TbIcons.TbPhoto },
    { name: "TbMusic", icon: TbIcons.TbMusic },
    { name: "TbHeadphones", icon: TbIcons.TbHeadphones },
    { name: "TbDeviceDesktop", icon: TbIcons.TbDeviceDesktop },
    { name: "TbDeviceMobile", icon: TbIcons.TbDeviceMobile },
    { name: "TbDeviceTablet", icon: TbIcons.TbDeviceTablet },
    { name: "TbPalette", icon: TbIcons.TbPalette },
    { name: "TbTool", icon: TbIcons.TbTool },
    { name: "TbSettings", icon: TbIcons.TbSettings },
    { name: "TbWrench", icon: TbIcons.TbWrench },
    { name: "TbBolt", icon: TbIcons.TbBolt },
    { name: "TbSun", icon: TbIcons.TbSun },
    { name: "TbMoon", icon: TbIcons.TbMoon },
    { name: "TbStar", icon: TbIcons.TbStar },
    { name: "TbMapPin", icon: TbIcons.TbMapPin },
    { name: "TbMap", icon: TbIcons.TbMap },
    { name: "TbWorld", icon: TbIcons.TbWorld },
    { name: "TbMail", icon: TbIcons.TbMail },
    { name: "TbMessage", icon: TbIcons.TbMessage },
    { name: "TbBell", icon: TbIcons.TbBell },
    { name: "TbLock", icon: TbIcons.TbLock },
    { name: "TbShield", icon: TbIcons.TbShield },
    { name: "TbAlertCircle", icon: TbIcons.TbAlertCircle },
    { name: "TbCheck", icon: TbIcons.TbCheck },
    { name: "TbX", icon: TbIcons.TbX },
    { name: "TbInfoCircle", icon: TbIcons.TbInfoCircle },
    { name: "TbQuestionMark", icon: TbIcons.TbQuestionMark },
    { name: "TbPlus", icon: TbIcons.TbPlus },
    { name: "TbMinus", icon: TbIcons.TbMinus },
    { name: "TbTrash", icon: TbIcons.TbTrash },
    { name: "TbPencil", icon: TbIcons.TbPencil },
    { name: "TbCopy", icon: TbIcons.TbCopy },
    { name: "TbDownload", icon: TbIcons.TbDownload },
    { name: "TbUpload", icon: TbIcons.TbUpload },
    { name: "TbLink", icon: TbIcons.TbLink },
    { name: "TbSearch", icon: TbIcons.TbSearch },
    { name: "TbFilter", icon: TbIcons.TbFilter },
    { name: "TbMenu", icon: TbIcons.TbMenu },
    { name: "TbGrid", icon: TbIcons.TbGrid },
    { name: "TbLayout", icon: TbIcons.TbLayout },
  ],
  "Tabler"
)

// BoxIcons
const BOXICONS = createIconList(
  [
    { name: "BiHome", icon: BiIcons.BiHome },
    { name: "BiStore", icon: BiIcons.BiStore },
    { name: "BiCart", icon: BiIcons.BiCart },
    { name: "BiShoppingBag", icon: BiIcons.BiShoppingBag },
    { name: "BiCar", icon: BiIcons.BiCar },
    { name: "BiCoffee", icon: BiIcons.BiCoffee },
    { name: "BiHeart", icon: BiIcons.BiHeart },
    { name: "BiBriefcase", icon: BiIcons.BiBriefcase },
    { name: "BiBook", icon: BiIcons.BiBook },
    { name: "BiCamera", icon: BiIcons.BiCamera },
    { name: "BiImage", icon: BiIcons.BiImage },
    { name: "BiMusic", icon: BiIcons.BiMusic },
    { name: "BiHeadphone", icon: BiIcons.BiHeadphone },
    { name: "BiLaptop", icon: BiIcons.BiLaptop },
    { name: "BiMobile", icon: BiIcons.BiMobile },
    { name: "BiTablet", icon: BiIcons.BiTablet },
    { name: "BiPalette", icon: BiIcons.BiPalette },
    { name: "BiWrench", icon: BiIcons.BiWrench },
    { name: "BiCog", icon: BiIcons.BiCog },
    { name: "BiZap", icon: BiIcons.BiZap },
    { name: "BiSun", icon: BiIcons.BiSun },
    { name: "BiMoon", icon: BiIcons.BiMoon },
    { name: "BiStar", icon: BiIcons.BiStar },
    { name: "BiMap", icon: BiIcons.BiMap },
    { name: "BiWorld", icon: BiIcons.BiWorld },
    { name: "BiEnvelope", icon: BiIcons.BiEnvelope },
    { name: "BiMessage", icon: BiIcons.BiMessage },
    { name: "BiBell", icon: BiIcons.BiBell },
    { name: "BiLock", icon: BiIcons.BiLock },
    { name: "BiShield", icon: BiIcons.BiShield },
    { name: "BiErrorCircle", icon: BiIcons.BiErrorCircle },
    { name: "BiCheckCircle", icon: BiIcons.BiCheckCircle },
    { name: "BiXCircle", icon: BiIcons.BiXCircle },
    { name: "BiInfoCircle", icon: BiIcons.BiInfoCircle },
    { name: "BiHelpCircle", icon: BiIcons.BiHelpCircle },
    { name: "BiPlusCircle", icon: BiIcons.BiPlusCircle },
    { name: "BiMinusCircle", icon: BiIcons.BiMinusCircle },
    { name: "BiTrash", icon: BiIcons.BiTrash },
    { name: "BiEdit", icon: BiIcons.BiEdit },
    { name: "BiCopy", icon: BiIcons.BiCopy },
    { name: "BiDownload", icon: BiIcons.BiDownload },
    { name: "BiUpload", icon: BiIcons.BiUpload },
    { name: "BiLink", icon: BiIcons.BiLink },
    { name: "BiSearch", icon: BiIcons.BiSearch },
    { name: "BiFilter", icon: BiIcons.BiFilter },
    { name: "BiMenu", icon: BiIcons.BiMenu },
    { name: "BiGrid", icon: BiIcons.BiGrid },
    { name: "BiListUl", icon: BiIcons.BiListUl },
  ],
  "BoxIcons"
)

// Game Icons
const GAME_ICONS = createIconList(
  [
    { name: "GiCarWheel", icon: GiIcons.GiCarWheel },
    { name: "GiCarDoor", icon: GiIcons.GiCarDoor },
    { name: "GiCarSeat", icon: GiIcons.GiCarSeat },
    { name: "GiGearStickPattern", icon: GiIcons.GiGearStickPattern },
    { name: "GiWrench", icon: GiIcons.GiWrench },
    { name: "GiHammer", icon: GiIcons.GiHammer },
    { name: "GiScrewdriver", icon: GiIcons.GiScrewdriver },
    { name: "GiToolbox", icon: GiIcons.GiToolbox },
    { name: "GiShoppingCart", icon: GiIcons.GiShoppingCart },
    { name: "GiShoppingBag", icon: GiIcons.GiShoppingBag },
    { name: "GiCupcake", icon: GiIcons.GiCupcake },
    { name: "GiHamburger", icon: GiIcons.GiHamburger },
    { name: "GiPizzaSlice", icon: GiIcons.GiPizzaSlice },
    { name: "GiCoffeeCup", icon: GiIcons.GiCoffeeCup },
    { name: "GiPill", icon: GiIcons.GiPill },
    { name: "GiHealthPotion", icon: GiIcons.GiHealthPotion },
    { name: "GiHospital", icon: GiIcons.GiHospital },
    { name: "GiMusicalNotes", icon: GiIcons.GiMusicalNotes },
    { name: "GiHeadphones", icon: GiIcons.GiHeadphones },
    { name: "GiCamera", icon: GiIcons.GiCamera },
    { name: "GiPhotoCamera", icon: GiIcons.GiPhotoCamera },
    { name: "GiLaptop", icon: GiIcons.GiLaptop },
    { name: "GiSmartphone", icon: GiIcons.GiSmartphone },
    { name: "GiTablet", icon: GiIcons.GiTablet },
    { name: "GiBook", icon: GiIcons.GiBook },
    { name: "GiGraduateCap", icon: GiIcons.GiGraduateCap },
    { name: "GiBriefcase", icon: GiIcons.GiBriefcase },
    { name: "GiWallet", icon: GiIcons.GiWallet },
    { name: "GiCreditCard", icon: GiIcons.GiCreditCard },
    { name: "GiMoneyStack", icon: GiIcons.GiMoneyStack },
    { name: "GiHeart", icon: GiIcons.GiHeart },
    { name: "GiEnvelope", icon: GiIcons.GiEnvelope },
    { name: "GiChatBubble", icon: GiIcons.GiChatBubble },
    { name: "GiBell", icon: GiIcons.GiBell },
    { name: "GiLock", icon: GiIcons.GiLock },
    { name: "GiShield", icon: GiIcons.GiShield },
    { name: "GiWarningSign", icon: GiIcons.GiWarningSign },
    { name: "GiCheckMark", icon: GiIcons.GiCheckMark },
    { name: "GiCrossMark", icon: GiIcons.GiCrossMark },
    { name: "GiInfo", icon: GiIcons.GiInfo },
    { name: "GiQuestionMark", icon: GiIcons.GiQuestionMark },
    { name: "GiPlus", icon: GiIcons.GiPlus },
    { name: "GiMinus", icon: GiIcons.GiMinus },
    { name: "GiTrashCan", icon: GiIcons.GiTrashCan },
    { name: "GiPencil", icon: GiIcons.GiPencil },
    { name: "GiCopy", icon: GiIcons.GiCopy },
    { name: "GiDownload", icon: GiIcons.GiDownload },
    { name: "GiUpload", icon: GiIcons.GiUpload },
    { name: "GiLink", icon: GiIcons.GiLink },
    { name: "GiMagnifyingGlass", icon: GiIcons.GiMagnifyingGlass },
    { name: "GiFilter", icon: GiIcons.GiFilter },
    { name: "GiHamburgerMenu", icon: GiIcons.GiHamburgerMenu },
    { name: "GiGrid", icon: GiIcons.GiGrid },
  ],
  "GameIcons"
)

// Remix Icons
const REMIX_ICONS = createIconList(
  [
    { name: "RiHome", icon: RiIcons.RiHomeLine },
    { name: "RiStore", icon: RiIcons.RiStoreLine },
    { name: "RiShoppingCart", icon: RiIcons.RiShoppingCartLine },
    { name: "RiShoppingBag", icon: RiIcons.RiShoppingBagLine },
    { name: "RiCar", icon: RiIcons.RiCarLine },
    { name: "RiCoffee", icon: RiIcons.RiCupLine },
    { name: "RiHeart", icon: RiIcons.RiHeartLine },
    { name: "RiBriefcase", icon: RiIcons.RiBriefcaseLine },
    { name: "RiBook", icon: RiIcons.RiBookLine },
    { name: "RiCamera", icon: RiIcons.RiCameraLine },
    { name: "RiImage", icon: RiIcons.RiImageLine },
    { name: "RiMusic", icon: RiIcons.RiMusicLine },
    { name: "RiHeadphone", icon: RiIcons.RiHeadphoneLine },
    { name: "RiComputer", icon: RiIcons.RiComputerLine },
    { name: "RiSmartphone", icon: RiIcons.RiSmartphoneLine },
    { name: "RiTablet", icon: RiIcons.RiTabletLine },
    { name: "RiPalette", icon: RiIcons.RiPaletteLine },
    { name: "RiTools", icon: RiIcons.RiToolsLine },
    { name: "RiSettings", icon: RiIcons.RiSettingsLine },
    { name: "RiWrench", icon: RiIcons.RiWrenchLine },
    { name: "RiFlash", icon: RiIcons.RiFlashlightLine },
    { name: "RiSun", icon: RiIcons.RiSunLine },
    { name: "RiMoon", icon: RiIcons.RiMoonLine },
    { name: "RiStar", icon: RiIcons.RiStarLine },
    { name: "RiMapPin", icon: RiIcons.RiMapPinLine },
    { name: "RiMap", icon: RiIcons.RiMapLine },
    { name: "RiGlobal", icon: RiIcons.RiGlobalLine },
    { name: "RiMail", icon: RiIcons.RiMailLine },
    { name: "RiMessage", icon: RiIcons.RiMessageLine },
    { name: "RiNotification", icon: RiIcons.RiNotificationLine },
    { name: "RiLock", icon: RiIcons.RiLockLine },
    { name: "RiShield", icon: RiIcons.RiShieldLine },
    { name: "RiAlert", icon: RiIcons.RiAlertLine },
    { name: "RiCheckboxCircle", icon: RiIcons.RiCheckboxCircleLine },
    { name: "RiCloseCircle", icon: RiIcons.RiCloseCircleLine },
    { name: "RiInformation", icon: RiIcons.RiInformationLine },
    { name: "RiQuestion", icon: RiIcons.RiQuestionLine },
    { name: "RiAddCircle", icon: RiIcons.RiAddCircleLine },
    { name: "RiSubtractCircle", icon: RiIcons.RiSubtractCircleLine },
    { name: "RiDelete", icon: RiIcons.RiDeleteLine },
    { name: "RiEdit", icon: RiIcons.RiEditLine },
    { name: "RiFileCopy", icon: RiIcons.RiFileCopyLine },
    { name: "RiDownload", icon: RiIcons.RiDownloadLine },
    { name: "RiUpload", icon: RiIcons.RiUploadLine },
    { name: "RiLink", icon: RiIcons.RiLinkLine },
    { name: "RiSearch", icon: RiIcons.RiSearchLine },
    { name: "RiFilter", icon: RiIcons.RiFilterLine },
    { name: "RiMenu", icon: RiIcons.RiMenuLine },
    { name: "RiGrid", icon: RiIcons.RiGridLine },
    { name: "RiList", icon: RiIcons.RiListCheck },
  ],
  "Remix"
)

// Combine all icons
const ALL_ICONS = [
  ...IONICONS,
  ...MATERIAL_ICONS,
  ...FONTAWESOME_ICONS,
  ...FEATHER_ICONS,
  ...ANTDESIGN_ICONS,
  ...BOOTSTRAP_ICONS,
  ...HEROICONS,
  ...HEROICONS2,
  ...TABLER_ICONS,
  ...BOXICONS,
  ...GAME_ICONS,
  ...REMIX_ICONS,
]

const LIBRARIES = [
  { value: "all", label: "All" },
  { value: "Ionicons", label: "Ionicons" },
  { value: "Material", label: "Material" },
  { value: "FontAwesome", label: "FontAwesome" },
  { value: "Feather", label: "Feather" },
  { value: "AntDesign", label: "AntDesign" },
  { value: "Bootstrap", label: "Bootstrap" },
  { value: "HeroIcons", label: "HeroIcons" },
  { value: "HeroIcons2", label: "HeroIcons v2" },
  { value: "Tabler", label: "Tabler" },
  { value: "BoxIcons", label: "BoxIcons" },
  { value: "GameIcons", label: "GameIcons" },
  { value: "Remix", label: "Remix" },
]

export default function IconPicker({ value, onSelect, onClose, open }: IconPickerProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedLibrary, setSelectedLibrary] = useState<"all" | string>("all")

  const filteredIcons = useMemo(() => {
    return ALL_ICONS.filter((icon) => {
      const matchesSearch = icon.name.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesLibrary = selectedLibrary === "all" || icon.library === selectedLibrary
      return matchesSearch && matchesLibrary
    })
  }, [searchTerm, selectedLibrary])

  const handleIconSelect = (iconName: string) => {
    onSelect(iconName)
    onClose()
  }

  const renderIcon = (iconItem: typeof ALL_ICONS[0]) => {
    const IconComponent = iconItem.icon
    if (!IconComponent) return null
    return <IconComponent className="h-6 w-6" />
  }

  const selectedIconItem = useMemo(() => {
    if (!value) return null
    const [library, iconName] = value.split(":")
    return ALL_ICONS.find((i) => i.library === library && i.name === iconName)
  }, [value])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] bg-white">
        <DialogHeader>
          <DialogTitle>Select an Icon</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Search and Filter */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search icons..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Tabs value={selectedLibrary} onValueChange={(v) => setSelectedLibrary(v as any)}>
              <TabsList className="flex-wrap h-auto">
                {LIBRARIES.map((lib) => (
                  <TabsTrigger key={lib.value} value={lib.value} className="text-xs">
                    {lib.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {/* Icon Grid */}
          <div className="border rounded-lg p-4 max-h-[60vh] overflow-y-auto">
            {filteredIcons.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>No icons found matching "{searchTerm}"</p>
              </div>
            ) : (
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-3">
                {filteredIcons.map((iconItem) => {
                  const iconValue = `${iconItem.library}:${iconItem.name}`
                  const isSelected = value === iconValue
                  return (
                    <button
                      key={iconValue}
                      type="button"
                      onClick={() => handleIconSelect(iconValue)}
                      className={`
                        flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
                        hover:bg-gray-50 hover:border-green-500
                        ${isSelected ? "bg-green-50 border-green-500" : "border-gray-200"}
                      `}
                      title={iconItem.name}
                    >
                      {renderIcon(iconItem)}
                      <span className="text-xs mt-1 text-gray-600 truncate w-full text-center">
                        {iconItem.name.replace(/^(Io|Md|Fa|Fa5|Fi|Ai|Bs|Hi|Hi2|Tb|Bi|Gi|Ri)/, "")}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Selected Icon Preview */}
          {selectedIconItem && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-gray-700">Selected:</span>
                {renderIcon(selectedIconItem)}
                <span className="text-sm text-gray-600">{selectedIconItem.name}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  onSelect("")
                  onClose()
                }}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
