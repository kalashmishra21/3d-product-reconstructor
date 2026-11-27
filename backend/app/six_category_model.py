import math
import hashlib
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torchvision.models import resnet18
from PIL import Image

def fibonacci_sphere(point_count, radius=0.25):
    # Build a deterministic neutral point template for strict buffer loading.
    indices = torch.arange(point_count, dtype=torch.float32)
    vertical = 1.0 - 2.0 * (indices + 0.5) / point_count
    radial = torch.sqrt(torch.clamp(1.0 - vertical.square(), min=0.0))
    angle = indices * (math.pi * (3.0 - math.sqrt(5.0)))
    return radius * torch.stack((radial * torch.cos(angle), vertical, radial * torch.sin(angle)), dim=1)

class SharedPointBranch(nn.Module):
    # Keep module names identical to the saved ResNet18PointCloud checkpoint.
    def __init__(self, point_count=2048, output_radius=0.35):
        super().__init__()
        backbone = resnet18(weights=None)  # No automatic network download.
        self.encoder = nn.Sequential(*list(backbone.children())[:-1])
        self.image_projection = nn.Sequential(nn.Linear(512, 256), nn.GELU(), nn.LayerNorm(256))
        self.pose_projection = nn.Sequential(nn.Linear(4, 64), nn.GELU(), nn.LayerNorm(64))
        self.queries = nn.Parameter(torch.randn(point_count, 64) * 0.02)
        self.register_buffer("base_points", fibonacci_sphere(point_count, radius=0.25))
        self.point_decoder = nn.Sequential(
            nn.Linear(384, 256), nn.GELU(), nn.LayerNorm(256),
            nn.Linear(256, 128), nn.GELU(), nn.Linear(128, 3),
        )
        nn.init.normal_(self.point_decoder[-1].weight, mean=0.0, std=0.01)
        nn.init.zeros_(self.point_decoder[-1].bias)
        self.point_count = int(point_count)
        self.output_radius = float(output_radius)

    def decode(self, pooled_features, pose_features):
        # Combine image, camera pose and learned query features into XYZ predictions.
        image_context = self.image_projection(pooled_features)
        pose_context = self.pose_projection(pose_features)
        context = torch.cat((image_context, pose_context), dim=-1)
        queries = self.queries.unsqueeze(0).expand(pooled_features.shape[0], -1, -1)
        expanded_context = context.unsqueeze(1).expand(-1, self.point_count, -1)
        offsets = torch.tanh(self.point_decoder(torch.cat((expanded_context, queries), dim=-1))) * 0.12
        return (self.base_points.unsqueeze(0) + offsets).clamp(-self.output_radius, self.output_radius)

    def train(self, mode=True):
        # Freeze encoder BatchNorm and feature statistics while decoder layers train.
        super().train(mode)
        self.encoder.eval()
        return self

class DepthFuseBlock(nn.Module):
    # Upsample coarse image features and fuse them with the next-resolution skip.
    def __init__(self, input_channels, output_channels):
        super().__init__()
        self.layers = nn.Sequential(
            nn.Conv2d(input_channels, output_channels, 3, padding=1, bias=False),
            nn.GroupNorm(8, output_channels), nn.GELU(),
            nn.Conv2d(output_channels, output_channels, 3, padding=1, bias=False),
            nn.GroupNorm(8, output_channels), nn.GELU(),
        )

    def forward(self, coarse, skip):
        upsampled = F.interpolate(coarse, size=skip.shape[-2:], mode="bilinear", align_corners=False)
        return self.layers(torch.cat((upsampled, skip), dim=1))

class SharedDepthHead(nn.Module):
    # Reuse the saved speaker depth head with identical tensor names and shapes.
    def __init__(self):
        super().__init__()
        self.decode3 = DepthFuseBlock(768, 128)
        self.decode2 = DepthFuseBlock(256, 96)
        self.decode1 = DepthFuseBlock(160, 64)
        self.decode0 = DepthFuseBlock(128, 48)
        self.refine = nn.Sequential(
            nn.Conv2d(48, 32, 3, padding=1, bias=False),
            nn.GroupNorm(8, 32), nn.GELU(),
        )
        self.output = nn.Conv2d(32, 2, kernel_size=1)

    def forward(self, stem, layer1, layer2, layer3, layer4, depth_min, depth_max):
        # Fuse the feature pyramid from coarse to fine and restore 224x224 resolution.
        features = self.decode3(layer4, layer3)
        features = self.decode2(features, layer2)
        features = self.decode1(features, layer1)
        features = self.decode0(features, stem)
        features = F.interpolate(features, size=(224, 224), mode="bilinear", align_corners=False)
        raw = self.output(self.refine(features))
        depth = depth_min + torch.sigmoid(raw[:, :1]) * (depth_max - depth_min)
        return depth, raw[:, 1:2]

class SixCategoryReconstructionModel(nn.Module):
    # One RGB/camera model serves the selected six product categories.
    def __init__(self, depth_min, depth_max):
        super().__init__()
        self.point_branch = SharedPointBranch()
        self.depth_head = SharedDepthHead()
        self.depth_min = float(depth_min)
        self.depth_max = float(depth_max)

    def train(self, mode=True):
        # Train decoder heads while always holding the ResNet18 encoder in evaluation mode.
        super().train(mode)
        self.point_branch.encoder.eval()
        return self

    def forward(self, rgb, pose):
        # Validate inference inputs; GT, masks and EXR are intentionally absent.
        if rgb.shape[1:] != (3, 224, 224) or pose.shape != (rgb.shape[0], 4):
            raise ValueError("Expected normalized RGB Bx3x224x224 and camera pose Bx4.")
        encoder_modules = list(self.point_branch.encoder.children())
        # The verified encoder is frozen, so feature maps need no autograd graph.
        with torch.no_grad():
            stem = encoder_modules[2](encoder_modules[1](encoder_modules[0](rgb)))
            layer1 = encoder_modules[4](encoder_modules[3](stem))
            layer2 = encoder_modules[5](layer1)
            layer3 = encoder_modules[6](layer2)
            layer4 = encoder_modules[7](layer3)
            pooled = encoder_modules[8](layer4).flatten(1)
        # These learned point layers remain differentiable and are shared across categories.
        global_points = self.point_branch.decode(pooled, pose)
        camera_depth, foreground_logits = self.depth_head(
            stem, layer1, layer2, layer3, layer4, self.depth_min, self.depth_max
        )
        return {"global_points": global_points, "camera_depth": camera_depth,
                "foreground_logits": foreground_logits}



EXPECTED_SHA="ea861cc8f2120d80a8509b2581949445ca8aa73e1d274ba2882ed37e770f3500"
MEAN=np.array([.485,.456,.406],dtype=np.float32)
STD=np.array([.229,.224,.225],dtype=np.float32)

def load_model(checkpoint_path, config_path, device="cuda"):
    path=Path(checkpoint_path)
    if hashlib.sha256(path.read_bytes()).hexdigest()!=EXPECTED_SHA:
        raise ValueError("Checkpoint SHA-256 mismatch")
    state=torch.load(path,map_location="cpu",weights_only=True)
    model_state=state["model"]
    import json
    settings=json.loads(Path(config_path).read_text())
    model=SixCategoryReconstructionModel(float(settings["depth_min"]),float(settings["depth_max"]))
    model.load_state_dict(model_state,strict=True)
    return model.to(device).eval()

def infer(model,rgb_image,pose,camera_to_world,intrinsics):
    image=Image.open(rgb_image).convert("RGB") if isinstance(rgb_image,(str,Path)) else rgb_image.convert("RGB")
    if image.size!=(224,224):
        raise ValueError("Expected calibrated 224x224 RGB image")
    pixels=np.asarray(image,dtype=np.float32)/255
    normalized=(pixels-MEAN)/STD
    device=next(model.parameters()).device
    rgb=torch.from_numpy(normalized).permute(2,0,1)[None].to(device)
    pose_tensor=torch.as_tensor(np.asarray(pose,dtype=np.float32),device=device)[None]
    if pose_tensor.shape!=(1,4):raise ValueError("Expected 4-value camera pose")
    with torch.inference_mode():prediction=model(rgb,pose_tensor)
    points=prediction["global_points"][0].cpu().numpy()
    depth=prediction["camera_depth"][0,0].cpu().numpy()
    mask=(prediction["foreground_logits"][0,0].cpu().numpy()>=0)&np.isfinite(depth)&(depth>0)
    camera=np.asarray(camera_to_world,dtype=np.float64)
    if camera.shape!=(4,4):raise ValueError("Expected 4x4 camera-to-world matrix")
    if not np.isfinite(points).all() or not np.isfinite(depth).all():raise ValueError("Nonfinite model output")
    return {"global_points":points,"depth":depth,"mask":mask,"camera_to_world":camera,"intrinsics":intrinsics}

def export_prediction(prediction,output_dir,name):
    target=Path(output_dir);target.mkdir(parents=True,exist_ok=True)
    points=prediction["global_points"]
    with (target/(name+"_global.ply")).open("x") as f:
        f.write("ply\nformat ascii 1.0\nelement vertex "+str(len(points))+"\nproperty float x\nproperty float y\nproperty float z\nend_header\n")
        for p in points:f.write(" ".join(map(str,p))+"\n")
    z=prediction["depth"];mask=prediction["mask"];k=prediction["intrinsics"];t=prediction["camera_to_world"]
    yy,xx=np.mgrid[0:224:2,0:224:2];d=z[yy,xx]
    camera=np.stack(((xx-k["cx"])*d/k["fx"],(k["cy"]-yy)*d/k["fy"],-d),-1).reshape(-1,3)
    xyz=camera@t[:3,:3].T+t[:3,3];h,w=yy.shape;ids=np.arange(h*w).reshape(h,w)
    a=ids[:-1,:-1].ravel();b=ids[:-1,1:].ravel();c=ids[1:,:-1].ravel();e=ids[1:,1:].ravel()
    faces=np.concatenate([np.stack([a,b,c],1),np.stack([b,e,c],1)])
    valid=mask[yy,xx].ravel();faces=faces[valid[faces].all(1)]
    tri=xyz[faces];edge=np.linalg.norm(tri-np.roll(tri,1,axis=1),axis=2)
    area=np.linalg.norm(np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]),axis=1)
    faces=faces[(edge.max(1)<.03)&(area>1e-10)]
    used,inverse=np.unique(faces,return_inverse=True)
    with (target/(name+"_visible.obj")).open("x") as f:
        for p in xyz[used]:f.write("v "+" ".join(map(str,p))+"\n")
        for face in inverse.reshape(-1,3):f.write("f "+" ".join(str(int(i)+1) for i in face)+"\n")
    return {"global_ply":str(target/(name+"_global.ply")),"visible_obj":str(target/(name+"_visible.obj"))}
